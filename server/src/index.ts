import cors from 'cors';
import express from 'express';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

interface RenderContextDebug {
  render_context_keys: string[];
  render_context_preview: Record<string, unknown>;
  recommended_placeholders: {
    minimal: string[];
    with_items_loop: string[];
  };
}

interface TemplateDef {
  template_code: string;
  name: string;
  filename: string;
}

interface TemplatePartScan {
  part: string;
  tags: Array<{
    raw: string;
    tag: string;
    start_index: number;
    end_index: number;
    context: string;
    split_across_text_nodes: boolean;
  }>;
  fullwidth_braces: Array<{
    char: '｛' | '｝';
    index: number;
    context: string;
  }>;
  zero_width_chars: Array<{
    char_code: string;
    index: number;
    context: string;
  }>;
  brace_hits: Array<{
    token: '{' | '}' | '{{' | '}}';
    index: number;
  }>;
  issues: Array<{
    type: 'nested_open' | 'close_without_open' | 'unclosed_tag' | 'split_tag';
    message: string;
    text_index?: number;
  }>;
}

interface TemplateFileInfo {
  path: string;
  size: number;
  mtime: string;
  sha256: string;
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

const createRenderData = (body: Partial<GenerateDocxBody> = {}): Record<string, unknown> => ({
  case: body.case ?? {},
  items: Array.isArray(body.items) ? body.items : [],
  attachments_summary: body.attachments_summary ?? null
});

const toPreviewObject = (value: unknown, maxEntries = 6): unknown => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }

    return [toPreviewObject(value[0], maxEntries)];
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, maxEntries);
  return Object.fromEntries(entries.map(([key, entryValue]) => [key, toPreviewObject(entryValue, maxEntries)]));
};

const buildRecommendedPlaceholders = (renderData: Record<string, unknown>): RenderContextDebug['recommended_placeholders'] => {
  const caseObj = renderData.case;
  const caseKeys = getObjectKeys(caseObj).slice(0, 6);
  const itemObj = Array.isArray(renderData.items) ? renderData.items[0] : undefined;
  const itemKeys = getObjectKeys(itemObj).slice(0, 4);

  const minimalFromCase = caseKeys.map((key) => `{case.${key}}`);
  const minimal = [
    ...minimalFromCase,
    '{attachments_summary}'
  ].slice(0, 8);

  const withItemsLoop = [
    ...minimalFromCase,
    '{attachments_summary}',
    '{#items}',
    ...itemKeys.map((key) => `{${key}}`),
    '{/items}'
  ];

  return {
    minimal,
    with_items_loop: withItemsLoop
  };
};

const buildRenderContextDebug = (renderData: Record<string, unknown>): RenderContextDebug => ({
  render_context_keys: Object.keys(renderData),
  render_context_preview: toPreviewObject(renderData) as Record<string, unknown>,
  recommended_placeholders: buildRecommendedPlaceholders(renderData)
});

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

const getTemplateFileInfo = (templatePath: string): TemplateFileInfo => {
  const stat = statSync(templatePath);
  const fileBuffer = readFileSync(templatePath);
  const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

  return {
    path: templatePath,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    sha256
  };
};

const getContext = (text: string, start: number, end: number, radius = 40) => {
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  return text.slice(from, to);
};

const isZeroWidthChar = (char: string): boolean => /[\u200B\u200C\u200D\u2060\uFEFF]/u.test(char);

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

  const flatText = textNodes.join('');
  const nodeEndIndexes: number[] = [];
  let currentLength = 0;
  textNodes.forEach((text) => {
    currentLength += text.length;
    nodeEndIndexes.push(currentLength);
  });

  const inferSplitAcrossNodes = (startIndex: number, endIndex: number): boolean => {
    return nodeEndIndexes.some((nodeEnd) => nodeEnd > startIndex && nodeEnd <= endIndex);
  };

  const scannedTags: TemplatePartScan['tags'] = [];
  const singleBraceTagPattern = /\{([^{}]+)\}/g;
  for (const match of flatText.matchAll(singleBraceTagPattern)) {
    const raw = match[0] || '';
    const tag = (match[1] || '').trim();
    const start = match.index ?? 0;
    const end = start + raw.length;
    scannedTags.push({
      raw,
      tag,
      start_index: start,
      end_index: end,
      context: getContext(flatText, start, end),
      split_across_text_nodes: inferSplitAcrossNodes(start, end)
    });
  }

  const fullwidthBraces: TemplatePartScan['fullwidth_braces'] = [];
  const fullwidthPattern = /[｛｝]/g;
  for (const match of flatText.matchAll(fullwidthPattern)) {
    const char = match[0] as '｛' | '｝';
    const index = match.index ?? 0;
    fullwidthBraces.push({
      char,
      index,
      context: getContext(flatText, index, index + 1)
    });
  }

  const zeroWidthChars: TemplatePartScan['zero_width_chars'] = [];
  for (const [index, char] of Array.from(flatText).entries()) {
    if (!isZeroWidthChar(char)) {
      continue;
    }

    zeroWidthChars.push({
      char_code: `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      index,
      context: getContext(flatText, index, index + 1)
    });
  }

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
    tags: scannedTags,
    fullwidth_braces: fullwidthBraces,
    zero_width_chars: zeroWidthChars,
    brace_hits: braceHits,
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

const isControlTag = (tag: string) => tag.startsWith('#') || tag.startsWith('/') || tag.startsWith('^') || tag === '.';

const resolvePath = (source: unknown, rawPath: string) => {
  const pathParts = rawPath.split('.').filter(Boolean);
  let current: unknown = source;

  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || !(part in (current as Record<string, unknown>))) {
      return { found: false, missing_at: part };
    }

    current = (current as Record<string, unknown>)[part];
  }

  return { found: true, value: current };
};

const buildTagResolution = (parts: TemplatePartScan[], renderData: Record<string, unknown>) => {
  const uniqueTags = Array.from(new Set(parts.flatMap((part) => part.tags.map((tag) => tag.tag))));

  return uniqueTags.map((tag) => {
    if (isControlTag(tag)) {
      return {
        tag,
        found: true,
        source: 'control_tag',
        note: 'Tag ควบคุม loop/section ของ docxtemplater'
      };
    }

    const rootResolution = resolvePath(renderData, tag);
    if (rootResolution.found) {
      return {
        tag,
        found: true,
        source: 'root',
        value_preview: toPreviewObject(rootResolution.value)
      };
    }

    const items = Array.isArray(renderData.items) ? renderData.items : [];
    if (tag && !tag.includes('.') && items.length > 0 && typeof items[0] === 'object' && items[0] !== null) {
      const loopResolution = resolvePath(items[0], tag);
      if (loopResolution.found) {
        return {
          tag,
          found: true,
          source: 'items_loop',
          value_preview: toPreviewObject(loopResolution.value)
        };
      }
    }

    return {
      tag,
      found: false,
      source: 'missing',
      missing_at: rootResolution.missing_at,
      recommendation: 'ตรวจ key ใน payload ให้ตรงกับ tag หรือแก้ tag ใน Word ให้ตรงกับ render data'
    };
  });
};

const getTemplateOr404 = (templateCode: string, res: express.Response) => {
  const templateDef = templates.find((template) => template.template_code === templateCode);
  if (!templateDef) {
    res.status(404).json({ message: `Template not found: ${templateCode}` });
    return null;
  }

  const templatePath = path.join(templatesDir, templateDef.filename);
  if (!existsSync(templatePath)) {
    res.status(404).json({ message: `Template file not found at ${templatePath}` });
    return null;
  }

  return { templateDef, templatePath };
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
  const templateBundle = getTemplateOr404(templateCode, res);
  if (!templateBundle) {
    return;
  }

  const report = scanTemplateDocx(templateBundle.templatePath);
  return res.json({
    template_code: templateCode,
    filename: templateBundle.templateDef.filename,
    has_issues: report.has_issues,
    parts: report.parts
  });
});

app.get('/api/debug/template-info', (req, res) => {
  const templateCode = String(req.query.template_code || 'basic_v1');
  const templateBundle = getTemplateOr404(templateCode, res);
  if (!templateBundle) {
    return;
  }

  return res.json(getTemplateFileInfo(templateBundle.templatePath));
});

app.get('/api/debug/template-tags', (req, res) => {
  const templateCode = String(req.query.template_code || 'basic_v1');
  const templateBundle = getTemplateOr404(templateCode, res);
  if (!templateBundle) {
    return;
  }

  const report = scanTemplateDocx(templateBundle.templatePath);
  const uniqueTags = Array.from(new Set(report.parts.flatMap((part) => part.tags.map((tag) => tag.tag))));
  const braceDiagnostics = {
    has_fullwidth_braces: report.parts.some((part) => part.fullwidth_braces.length > 0),
    has_zero_width_chars: report.parts.some((part) => part.zero_width_chars.length > 0),
    recommendations: [
      'ใช้วงเล็บปีกกา ASCII เท่านั้น: { และ } (0x7B/0x7D)',
      'ถ้าสงสัยว่ามีอักขระแฝง ให้พิมพ์ tag ใน Notepad แล้วคัดลอกแบบ Keep Text Only ลง Word'
    ]
  };

  return res.json({
    template_code: templateCode,
    delimiter: 'single_brace',
    tags: uniqueTags,
    parts: report.parts,
    brace_diagnostics: braceDiagnostics
  });
});

app.get('/api/debug/render-context', (req, res) => {
  const templateCode = String(req.query.template_code || 'basic_v1');
  const templateDef = templates.find((template) => template.template_code === templateCode);

  if (!templateDef) {
    return res.status(404).json({ message: `Template not found: ${templateCode}` });
  }

  const sampleBody: Partial<GenerateDocxBody> = {
    template_code: templateCode,
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

  const renderData = createRenderData(sampleBody);
  return res.json({
    template_code: templateCode,
    ...buildRenderContextDebug(renderData)
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
    const templateInfo = getTemplateFileInfo(templatePath);
    console.log('[generate-docx] template_absolute_path:', templateInfo.path);
    console.log('[generate-docx] template_stat:', {
      size: templateInfo.size,
      mtime: templateInfo.mtime
    });
    console.log('[generate-docx] template_sha256:', templateInfo.sha256);

    const binary = readFileSync(templatePath, 'binary');
    const zip = new PizZip(binary);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '-'
    });

    const renderData = createRenderData(body);
    const templateReport = scanTemplateDocx(templatePath);
    const tagResolution = buildTagResolution(templateReport.parts, renderData);

    doc.render(renderData);

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
        note: 'ใช้ keys เหล่านี้ไปทำ placeholder ในไฟล์ word',
        template_info: templateInfo,
        template_tags: Array.from(new Set(templateReport.parts.flatMap((part) => part.tags.map((tag) => tag.tag)))),
        tag_resolution: tagResolution,
        delimiter: 'single_brace',
        ...buildRenderContextDebug(renderData)
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
      const renderData = createRenderData(body);
      return res.status(500).json({
        ok: false,
        message: `Failed to generate DOCX: ${message}`,
        case_keys: payloadShape.case_keys,
        items_keys: payloadShape.items_keys,
        attachments_summary_type: payloadShape.attachments_summary_type,
        docxtemplater_errors: multiErrorDetails,
        ...buildRenderContextDebug(renderData)
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
