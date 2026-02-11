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
  attachments_summary: unknown;
}

interface PayloadShape {
  template_code: string;
  case_keys: string[];
  items_keys: string[];
  attachments_summary_type: string;
  example_placeholders: string[];
}

interface TemplateDef {
  template_code: string;
  name: string;
  filename: string;
}

interface TemplatePartScan {
  part: string;
  brace_hits: Array<{
    token: '{' | '}' | '{{' | '}}';
    index: number;
  }>;
  tags: Array<{
    value: string;
    start_text_index: number;
    end_text_index: number;
    split_across_text_nodes: boolean;
  }>;
  issues: Array<{
    type: 'nested_open' | 'close_without_open' | 'unclosed_tag' | 'split_tag';
    message: string;
    text_index?: number;
  }>;
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

const getObjectKeys = (value: unknown): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.keys(value as Record<string, unknown>);
};

const getPayloadShape = (body: Partial<GenerateDocxBody> = {}): PayloadShape => {
  const case_keys = getObjectKeys(body.case);
  const firstItem = Array.isArray(body.items) ? body.items[0] : undefined;
  const items_keys = getObjectKeys(firstItem);

  return {
    template_code: body.template_code || 'basic_v1',
    case_keys,
    items_keys,
    attachments_summary_type:
      body.attachments_summary === null ? 'null' : typeof body.attachments_summary,
    example_placeholders: [
      ...case_keys.map((key) => `{{case.${key}}}`),
      ...items_keys.map((key) => `{{items[0].${key}}}`),
      '{#items}...{/items}'
    ]
  };
};

const parseDocxErrorDetails = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const typedError = error as {
    properties?: {
      id?: string;
      errors?: Array<{
        properties?: {
          id?: string;
          explanation?: string;
          context?: string;
          xtag?: string;
        };
      }>;
    };
  };

  if (typedError.properties?.id !== 'multi_error' || !Array.isArray(typedError.properties.errors)) {
    return undefined;
  }

  return typedError.properties.errors.map((multiErr) => ({
    id: multiErr.properties?.id || 'unknown',
    explanation: multiErr.properties?.explanation || 'No explanation',
    context: multiErr.properties?.context,
    xtag: multiErr.properties?.xtag
  }));
};

const scanTemplatePartXml = (part: string, xml: string): TemplatePartScan => {
  const braceHits: TemplatePartScan['brace_hits'] = [];
  const bracePattern = /\{\{|\}\}|\{|\}/g;

  for (const hit of xml.matchAll(bracePattern)) {
    const token = hit[0] as '{' | '}' | '{{' | '}}';
    braceHits.push({ token, index: hit.index ?? 0 });
  }

  const textNodePattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  const textNodes: string[] = [];
  for (const node of xml.matchAll(textNodePattern)) {
    const rawText = node[1] || '';
    textNodes.push(
      rawText
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
    );
  }

  const tags: TemplatePartScan['tags'] = [];
  const issues: TemplatePartScan['issues'] = [];
  let insideTag = false;
  let openTextIndex = -1;
  let currentTag = '';

  textNodes.forEach((text, textIndex) => {
    for (const char of text) {
      if (char === '{') {
        if (insideTag) {
          issues.push({
            type: 'nested_open',
            message: `พบ { ซ้อน ขณะกำลังอ่าน tag ที่ยังไม่ปิด: ${currentTag}`,
            text_index: textIndex
          });
        }
        insideTag = true;
        openTextIndex = textIndex;
        currentTag = '{';
        continue;
      }

      if (char === '}') {
        if (!insideTag) {
          issues.push({
            type: 'close_without_open',
            message: 'พบ } โดยไม่มี { เปิดมาก่อน',
            text_index: textIndex
          });
          continue;
        }

        currentTag += '}';
        tags.push({
          value: currentTag,
          start_text_index: openTextIndex,
          end_text_index: textIndex,
          split_across_text_nodes: openTextIndex !== textIndex
        });

        if (openTextIndex !== textIndex) {
          issues.push({
            type: 'split_tag',
            message: `tag ${currentTag} ถูกแยกข้าม w:t หลายก้อน (${openTextIndex} -> ${textIndex})`,
            text_index: textIndex
          });
        }

        insideTag = false;
        openTextIndex = -1;
        currentTag = '';
        continue;
      }

      if (insideTag) {
        currentTag += char;
      }
    }
  });

  if (insideTag) {
    issues.push({
      type: 'unclosed_tag',
      message: `tag เปิดค้างโดยไม่มี } ปิด: ${currentTag}`,
      text_index: openTextIndex
    });
  }

  return {
    part,
    brace_hits: braceHits,
    tags,
    issues
  };
};

const scanTemplateDocx = (templatePath: string): { parts: TemplatePartScan[]; has_issues: boolean } => {
  const binary = readFileSync(templatePath, 'binary');
  const zip = new PizZip(binary);
  const allEntries = Object.keys(zip.files);
  const targetParts = allEntries.filter(
    (entry) => entry === 'word/document.xml' || /^word\/(header|footer)\d+\.xml$/.test(entry)
  );

  const parts = targetParts.map((part) => {
    const xml = zip.file(part)?.asText() || '';
    return scanTemplatePartXml(part, xml);
  });

  return {
    parts,
    has_issues: parts.some((part) => part.issues.length > 0)
  };
};

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

app.get('/api/debug/payload-shape', (_req, res) => {
  const expectedBody: Partial<GenerateDocxBody> = {
    template_code: 'basic_v1',
    case: {
      case_no: 'PR-2025-001',
      title: 'Procurement title',
      department: 'IT',
      requester: 'Requester name',
      vendor: 'Vendor name',
      request_date: '2025-02-11'
    },
    items: [
      {
        description: 'Sample item',
        quantity: 1,
        unit: 'pcs',
        unit_price: 1000
      }
    ],
    attachments_summary: 'ไฟล์แนบ 2 รายการ'
  };

  return res.json(getPayloadShape(expectedBody));
});

app.get('/api/debug/template-scan', (req, res) => {
  const templateCode = String(req.query.template_code || 'basic_v1');
  const templateDef = templates.find((template) => template.template_code === templateCode);

  if (!templateDef) {
    return res.status(404).json({ message: `Template not found: ${templateCode}` });
  }

  const templatePath = path.join(templatesDir, templateDef.filename);

  if (!existsSync(templatePath)) {
    return res.status(404).json({ message: `Template file not found at ${templatePath}` });
  }

  const report = scanTemplateDocx(templatePath);
  return res.json({
    template_code: templateCode,
    filename: templateDef.filename,
    has_issues: report.has_issues,
    parts: report.parts
  });
});

app.post('/api/generate-docx', (req, res) => {
  const body = req.body as GenerateDocxBody;
  const debugEnabled = req.query.debug === '1';
  const payloadShape = getPayloadShape(body);

  console.log('[generate-docx] case_keys:', payloadShape.case_keys);
  console.log('[generate-docx] items_keys:', payloadShape.items_keys);
  console.log('[generate-docx] attachments_summary_type:', payloadShape.attachments_summary_type);

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
      linebreaks: true,
      nullGetter: () => '-'
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

    if (debugEnabled) {
      return res.json({
        ok: true,
        case_keys: payloadShape.case_keys,
        items_keys: payloadShape.items_keys,
        attachments_summary_type: payloadShape.attachments_summary_type,
        note: 'ใช้ keys เหล่านี้ไปทำ placeholder ในไฟล์ word'
      });
    }

    const downloadName = `${String((body.case as Record<string, unknown>).case_no || 'procurement')}_${templateDef.template_code}.docx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    return res.send(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const multiErrorDetails = parseDocxErrorDetails(error);

    if (multiErrorDetails) {
      console.error('[generate-docx] docxtemplater multi_error details:', multiErrorDetails);
    }

    if (debugEnabled) {
      return res.status(500).json({
        ok: false,
        message: `Failed to generate DOCX: ${message}`,
        case_keys: payloadShape.case_keys,
        items_keys: payloadShape.items_keys,
        attachments_summary_type: payloadShape.attachments_summary_type,
        docxtemplater_errors: multiErrorDetails
      });
    }

    return res.status(500).json({ message: `Failed to generate DOCX: ${message}` });
  }
});

app.listen(port, () => {
  console.log(`DOCX backend running on http://localhost:${port}`);
  console.log(`CORS origin: ${frontendOrigin}`);
  console.log(`Templates dir: ${templatesDir}`);
});
