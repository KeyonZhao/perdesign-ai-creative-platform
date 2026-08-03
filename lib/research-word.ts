import JSZip from "jszip";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export async function downloadResearchWord(content: string, title: string) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml());
  zip.folder("_rels")?.file(".rels", packageRelationshipsXml());
  const word = zip.folder("word");
  word?.file("document.xml", documentXml(content));
  word?.file("styles.xml", stylesXml());
  word?.file("numbering.xml", numberingXml());
  word?.folder("_rels")?.file("document.xml.rels", documentRelationshipsXml());
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(title || "产品策划案")}.docx`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function documentXml(content: string) {
  const paragraphs = content.replace(/\r/g, "").split("\n").flatMap((rawLine) => {
    const line = rawLine.trim();
    if (!line) return ["<w:p/>"];
    const heading = line.match(/^(#{1,4})\s+(.+)/);
    if (heading) return [paragraphXml(heading[2], `Heading${heading[1].length}`)];
    const bullet = line.match(/^[-*•]\s+(.+)/);
    if (bullet) return [listParagraphXml(bullet[1], 1)];
    const numbered = line.match(/^\d+[.)、]\s+(.+)/);
    if (numbered) return [listParagraphXml(numbered[1], 2)];
    const quote = line.match(/^>\s?(.+)/);
    if (quote) return [paragraphXml(quote[1], "Quote")];
    if (/^---+$/.test(line)) return [paragraphXml("", "Divider")];
    return [paragraphXml(line, "Normal")];
  }).join("");
  return `${XML_HEADER}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1276" w:bottom="1134" w:left="1276" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

function paragraphXml(text: string, style: string) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:keepNext w:val="${style.startsWith("Heading") ? "1" : "0"}"/></w:pPr>${inlineRunsXml(text)}</w:p>`;
}

function listParagraphXml(text: string, numId: number) {
  return `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${inlineRunsXml(text)}</w:p>`;
}

function inlineRunsXml(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return runXml(part.slice(2, -2), "<w:b/><w:bCs/>");
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return runXml(part.slice(1, -1), '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/><w:shd w:val="clear" w:color="auto" w:fill="F1F1F3"/><w:sz w:val="20"/>');
    }
    return runXml(part, "");
  }).join("");
}

function runXml(text: string, properties: string) {
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function stylesXml() {
  const paragraphStyle = (id: string, name: string, size: number, bold: boolean, before: number, after: number, color = "202124", extra = "") =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="360" w:lineRule="auto"/>${extra}</w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:color w:val="${color}"/>${bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  return `${XML_HEADER}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="23"/><w:szCs w:val="23"/><w:color w:val="292A2D"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="180" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${paragraphStyle("Normal", "Normal", 23, false, 0, 180)}${paragraphStyle("Heading1", "heading 1", 40, true, 80, 260)}${paragraphStyle("Heading2", "heading 2", 34, true, 400, 180)}${paragraphStyle("Heading3", "heading 3", 28, true, 320, 140)}${paragraphStyle("Heading4", "heading 4", 24, true, 260, 120)}${paragraphStyle("Quote", "Quote", 23, false, 120, 220, "5F6368", '<w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="10" w:color="8B79FF"/></w:pBdr>')}${paragraphStyle("Divider", "Divider", 2, false, 180, 180, "DADCE0", '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="DADCE0"/></w:pBdr>')}</w:styles>`;
}

function numberingXml() {
  return `${XML_HEADER}<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="540"/></w:tabs><w:ind w:left="540" w:hanging="260"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="600"/></w:tabs><w:ind w:left="600" w:hanging="320"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;
}

function contentTypesXml() {
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
}

function packageRelationshipsXml() {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
}

function documentRelationshipsXml() {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;
}

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] || character);
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "产品策划案";
}
