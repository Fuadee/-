import cors from 'cors';
import express from 'express';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

interface GenerateDocxBody {
  template_code: string;
  case: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  attachments_summary: string;
}

interface TemplateDef {
  template_code: string;
  name: string;
  filename: string;
}

const templates: TemplateDef[] = [
  {
    template_code: 'basic_v1',
    name: 'Procurement Basic v1',
    filename: 'procurement_basic_v1.docx'
  }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.resolve(__dirname, '../templates');

const baseTemplateParts = {
  contentTypes: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  rels: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  documentXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14">
  <w:body>
    <w:p><w:r><w:t>Procurement Request ({case.case_no})</w:t></w:r></w:p>
    <w:p><w:r><w:t>Title: {case.title}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Department: {case.department}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Requester: {case.requester}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Vendor: {case.vendor}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Request date: {case.request_date}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Items</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#items}- {description} | qty: {quantity} {unit} | price: {unit_price}{/items}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Attachments: {attachments_summary}</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`
};

const ensureSampleTemplateExists = (templatePath: string) => {
  if (existsSync(templatePath)) {
    return;
  }

  const zip = new PizZip();
  zip.file('[Content_Types].xml', baseTemplateParts.contentTypes);
  zip.file('_rels/.rels', baseTemplateParts.rels);
  zip.file('word/document.xml', baseTemplateParts.documentXml);
  const templateBuffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  writeFileSync(templatePath, templateBuffer);
};

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

for (const templateDef of templates) {
  ensureSampleTemplateExists(path.join(templatesDir, templateDef.filename));
}

app.use(
  cors({
    origin: [frontendOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173']
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port, templatesDir });
});

app.get('/api/templates', (_req, res) => {
  const availableTemplates = templates
    .map(({ template_code, name, filename }) => ({
      template_code,
      name,
      filename,
      exists: existsSync(path.join(templatesDir, filename))
    }))
    .filter((item) => item.exists)
    .map(({ template_code, name }) => ({ template_code, name }));

  return res.json(availableTemplates);
});

app.post('/api/generate-docx', (req, res) => {
  const body = req.body as GenerateDocxBody;

  if (!body || !body.template_code || !body.case || !Array.isArray(body.items)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }

  const templateDef = templates.find((template) => template.template_code === body.template_code);

  if (!templateDef) {
    return res.status(404).json({ message: `Template not found: ${body.template_code}` });
  }

  const templatePath = path.join(templatesDir, templateDef.filename);

  if (!existsSync(templatePath)) {
    return res.status(404).json({
      message: `Template file not found at ${templatePath}`
    });
  }

  try {
    const binary = readFileSync(templatePath, 'binary');
    const zip = new PizZip(binary);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    doc.render({
      case: body.case,
      items: body.items,
      attachments_summary: body.attachments_summary
    });

    const output = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });

    const downloadName = `${String((body.case as Record<string, unknown>).case_no || 'procurement')}_${templateDef.template_code}.docx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    return res.send(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ message: `Failed to generate DOCX: ${message}` });
  }
});

app.listen(port, () => {
  console.log(`DOCX backend running on http://localhost:${port}`);
  console.log(`CORS origin: ${frontendOrigin}`);
  console.log(`Templates dir: ${templatesDir}`);
});
