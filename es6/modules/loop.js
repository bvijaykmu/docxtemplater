const {
	mergeObjects,
	chunkBy,
	last,
	isParagraphStart,
	isParagraphEnd,
	isContent,
} = require("../doc-utils");
const wrapper = require("../module-wrapper");
const { match, getValue, getValues } = require("../prefix-matcher");

const moduleName = "loop";

function hasContent(parts) {
	return parts.some(function(part) {
		return isContent(part);
	});
}

function isEnclosedByParagraphs(parsed) {
	if (parsed.length === 0) {
		return false;
	}
	return isParagraphStart(parsed[0]) && isParagraphEnd(last(parsed));
}

function getOffset(chunk) {
	return hasContent(chunk) ? 0 : chunk.length;
}

class LoopModule {
	constructor() {
		this.name = "LoopModule";
		this.prefix = {
			start: "#",
			end: "/",
			dash: /^-([^\s]+)\s(.+)$/,
			inverted: "^",
		};
	}
	parse(placeHolderContent) {
		const module = moduleName;
		const type = "placeholder";
		const { start, inverted, dash, end } = this.prefix;
		if (match(start, placeHolderContent)) {
			return {
				type,
				value: getValue(start, placeHolderContent),
				expandTo: "auto",
				module,
				location: "start",
				inverted: false,
			};
		}
		if (match(inverted, placeHolderContent)) {
			return {
				type,
				value: getValue(inverted, placeHolderContent),
				expandTo: "auto",
				module,
				location: "start",
				inverted: true,
			};
		}
		if (match(end, placeHolderContent)) {
			return {
				type,
				value: getValue(end, placeHolderContent),
				module,
				location: "end",
			};
		}
		if (match(dash, placeHolderContent)) {
			const [, expandTo, value] = getValues(dash, placeHolderContent);
			return {
				type,
				value,
				expandTo,
				module,
				location: "start",
				inverted: false,
			};
		}
		return null;
	}
	getTraits(traitName, parsed) {
		if (traitName !== "expandPair") {
			return;
		}

		return parsed.reduce(function(tags, part, offset) {
			if (part.type === "placeholder" && part.module === moduleName) {
				tags.push({ part, offset });
			}
			return tags;
		}, []);
	}
	postparse(parsed, { basePart }) {
		if (!isEnclosedByParagraphs(parsed)) {
			return parsed;
		}
		if (
			!basePart ||
			basePart.expandTo !== "auto" ||
			basePart.module !== moduleName
		) {
			return parsed;
		}
		let level = 0;
		const chunks = chunkBy(parsed, function(p) {
			if (isParagraphStart(p)) {
				level++;
				if (level === 1) {
					return "start";
				}
			}
			if (isParagraphEnd(p)) {
				level--;
				if (level === 0) {
					return "end";
				}
			}
			return null;
		});
		if (chunks.length <= 2) {
			return parsed;
		}

		const firstChunk = chunks[0];
		const lastChunk = last(chunks);
		const firstOffset = getOffset(firstChunk);
		const lastOffset = getOffset(lastChunk);
		if (firstOffset === 0 || lastOffset === 0) {
			return parsed;
		}
		let hasPageBreak = false;
		lastChunk.forEach(function(part) {
			if (part.tag === "w:br" && part.value.indexOf('w:type="page"') !== -1) {
				hasPageBreak = true;
			}
		});

		if (hasPageBreak) {
			basePart.hasPageBreak = true;
		}
		return parsed.slice(firstOffset, parsed.length - lastOffset);
	}
	render(part, options) {
		if (part.type !== "placeholder" || part.module !== moduleName) {
			return null;
		}
		let totalValue = [];
		let errors = [];
		function loopOver(scope, i, length) {
			const scopeManager = options.scopeManager.createSubScopeManager(
				scope,
				part.value,
				i,
				part,
				length
			);
			const subRendered = options.render(
				mergeObjects({}, options, {
					compiled: part.subparsed,
					tags: {},
					scopeManager,
				})
			);
			if (part.hasPageBreak && i === length - 1) {
				let found = false;
				for (let j = subRendered.parts.length - 1; i >= 0; i--) {
					const p = subRendered.parts[j];
					if (p === "</w:p>" && !found) {
						found = true;
						subRendered.parts.splice(j, 0, '<w:r><w:br w:type="page"/></w:r>');
						break;
					}
				}

				if (!found) {
					subRendered.parts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
				}
			}
			totalValue = totalValue.concat(subRendered.parts);
			errors = errors.concat(subRendered.errors || []);
		}
		let result;
		try {
			result = options.scopeManager.loopOver(
				part.value,
				loopOver,
				part.inverted,
				{
					part,
				}
			);
		} catch (e) {
			errors.push(e);
			return { errors };
		}
		if (result === false) {
			if (part.hasPageBreak) {
				return {
					value: '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
				};
			}
			return {
				value: part.emptyValue || "",
				errors,
			};
		}
		const contains = options.fileTypeConfig.tagShouldContain || [];

		return { value: options.joinUncorrupt(totalValue, contains), errors };
	}
	resolve(part, options) {
		if (part.type !== "placeholder" || part.module !== moduleName) {
			return null;
		}

		const sm = options.scopeManager;
		const promisedValue = Promise.resolve().then(function() {
			return sm.getValue(part.value, { part });
		});
		const promises = [];
		function loopOver(scope, i, length) {
			const scopeManager = sm.createSubScopeManager(
				scope,
				part.value,
				i,
				part,
				length
			);
			promises.push(
				options.resolve({
					filePath: options.filePath,
					modules: options.modules,
					baseNullGetter: options.baseNullGetter,
					resolve: options.resolve,
					compiled: part.subparsed,
					tags: {},
					scopeManager,
				})
			);
		}
		return promisedValue.then(function(value) {
			sm.loopOverValue(value, loopOver, part.inverted);
			return Promise.all(promises).then(function(r) {
				return r.map(function({ resolved }) {
					return resolved;
				});
			});
		});
	}
}

module.exports = () => wrapper(new LoopModule());
