const { expectToThrow, createDoc, shouldBeSame, isNode12 } = require("./utils");
const Errors = require("../errors.js");
const { expect } = require("chai");
const { xml2str } = require("../doc-utils");

describe("Verify apiversion", function() {
	it("should work with valid api version", function() {
		const module = {
			requiredAPIVersion: "3.19.0",
			render(part) {
				return part.value;
			},
		};
		const doc = createDoc("loop-valid.docx");
		doc.attachModule(module);
	});

	it("should fail with valid api version", function() {
		const module = {
			requiredAPIVersion: "3.92.0",
			render(part) {
				return part.value;
			},
		};
		const doc = createDoc("loop-valid.docx");

		expectToThrow(() => doc.attachModule(module), Errors.XTAPIVersionError, {
			message:
				"The minor api version is not uptodate, you probably have to update docxtemplater with npm install --save docxtemplater",
			name: "APIVersionError",
			properties: {
				id: "api_version_error",
				currentModuleApiVersion: [3, 19, 0],
				neededVersion: [3, 92, 0],
			},
		});
	});
});

describe("Module attachment", function() {
	it("should not allow to attach the same module twice", function() {
		const module = {
			requiredAPIVersion: "3.0.0",
			render(part) {
				return part.value;
			},
		};
		const doc1 = createDoc("loop-valid.docx");
		doc1.attachModule(module);
		const doc2 = createDoc("tag-example.docx");

		let errMessage = null;
		try {
			doc2.attachModule(module);
		} catch (e) {
			errMessage = e.message;
		}
		expect(errMessage).to.equal(
			"Cannot attach a module that was already attached"
		);
	});
});

describe("Module xml parse", function() {
	it("should be possible to parse xml files", function() {
		let xmlDocuments;

		const module = {
			requiredAPIVersion: "3.0.0",
			optionsTransformer(options, docxtemplater) {
				const relsFiles = docxtemplater.zip
					.file(/document.xml.rels/)
					.map(file => file.name);
				options.xmlFileNames = options.xmlFileNames.concat(relsFiles);
				return options;
			},
			set(options) {
				if (options.xmlDocuments) {
					xmlDocuments = options.xmlDocuments;
				}
			},
		};

		const doc = createDoc("tag-example.docx");
		doc.attachModule(module);
		doc.compile();

		const xmlKeys = Object.keys(xmlDocuments);
		expect(xmlKeys).to.deep.equal(["word/_rels/document.xml.rels"]);
		const rels = xmlDocuments[
			"word/_rels/document.xml.rels"
		].getElementsByTagName("Relationship");
		expect(rels.length).to.equal(10);

		const str = xml2str(xmlDocuments["word/_rels/document.xml.rels"]);
		if (isNode12()) {
			expect(str).to
				.equal(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects" Target="stylesWithEffects.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/></Relationships>`);
			rels[5].setAttribute("Foobar", "Baz");
			doc.render();
			shouldBeSame({ doc, expectedName: "expected-module-change-rels.docx" });
		}
	});
});

describe("Module unique tags xml", function() {
	it("should not cause an issue if tagsXmlLexedArray contains duplicates", function() {
		const module = {
			requiredAPIVersion: "3.0.0",
			optionsTransformer(options, docxtemplater) {
				docxtemplater.fileTypeConfig.tagsXmlLexedArray.push(
					"w:p",
					"w:r",
					"w:p"
				);
				return options;
			},
		};

		const doc = createDoc("tag-example.docx");
		doc.attachModule(module);
		doc.setData({
			first_name: "Hipp",
			last_name: "Edgar",
			phone: "0652455478",
			description: "New Website",
		});
		doc.compile();
		doc.render();
		shouldBeSame({ doc, expectedName: "expected-tag-example.docx" });
	});
});
