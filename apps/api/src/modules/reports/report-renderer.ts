import { Locale, localizeText, MessageKey, t } from '@govmind/i18n';
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';

export interface ReportContent {
  title: string;
  organization_name: string;
  period: { from: string; to: string };
  report_type: string;
  generated_at: string;
  summary: Record<string, number | null>;
  by_organization: Record<string, unknown>[];
  late_by_organization: Record<string, unknown>[];
  kpi_behind_plan: Record<string, unknown>[];
  trend: Record<string, unknown>[];
  commentary?: { text: string; model_name: string; model_version: string } | null;
}

interface TableSpec {
  title: string;
  columns: { key: string; label: string; localize?: boolean }[];
  rows: Record<string, unknown>[];
}

function tables(c: ReportContent, l: Locale): TableSpec[] {
  const L = (k: MessageKey) => t(l, k);
  return [
    {
      title: L('reports.summary'),
      columns: [
        { key: 'metric', label: L('common.name') },
        { key: 'value', label: L('common.total') },
      ],
      rows: [
        { metric: L('dashboard.tasks_total'), value: c.summary.total },
        { metric: L('dashboard.tasks_done'), value: c.summary.done },
        { metric: L('dashboard.tasks_open'), value: c.summary.open },
        { metric: L('dashboard.tasks_overdue'), value: c.summary.overdue },
        { metric: `${L('dashboard.on_time')}, %`, value: c.summary.on_time_pct },
      ],
    },
    {
      title: L('reports.comparison'),
      columns: [
        { key: 'organization_name', label: L('common.organization'), localize: true },
        { key: 'total', label: L('common.total') },
        { key: 'done', label: L('dashboard.tasks_done') },
        { key: 'overdue', label: L('dashboard.tasks_overdue') },
        { key: 'completion_pct', label: `${L('dashboard.completion')}, %` },
      ],
      rows: c.by_organization,
    },
    {
      title: L('dashboard.late_by_org'),
      columns: [
        { key: 'organization_name', label: L('common.organization'), localize: true },
        { key: 'late', label: L('dashboard.late') },
        { key: 'late_pct', label: `${L('dashboard.late')}, %` },
        { key: 'prev_late', label: L('dashboard.prev_late') },
        { key: 'prev_late_pct', label: `${L('dashboard.prev_late')}, %` },
      ],
      rows: c.late_by_organization,
    },
    {
      title: L('dashboard.kpi_behind'),
      columns: [
        { key: 'kpi_name', label: L('common.name'), localize: true },
        { key: 'organization_name', label: L('common.organization'), localize: true },
        { key: 'planned_value', label: L('kpi.planned') },
        { key: 'actual_value', label: L('kpi.actual') },
        { key: 'attainment_pct', label: L('kpi.attainment') },
      ],
      rows: c.kpi_behind_plan,
    },
    {
      title: L('dashboard.trend'),
      columns: [
        { key: 'month', label: L('common.period') },
        { key: 'due', label: L('dashboard.due') },
        { key: 'completed', label: L('dashboard.completed') },
        { key: 'late', label: L('dashboard.late') },
      ],
      rows: c.trend,
    },
  ];
}

function cell(row: Record<string, unknown>, col: TableSpec['columns'][number], l: Locale): string {
  const v = row[col.key];
  if (v === null || v === undefined) return '—';
  return col.localize ? localizeText(l, String(v)) : String(v);
}

function header(c: ReportContent, l: Locale) {
  return {
    title: localizeText(l, c.title),
    lines: [
      `${t(l, 'common.organization')}: ${localizeText(l, c.organization_name)}`,
      `${t(l, 'common.period')}: ${c.period.from} — ${c.period.to}`,
      `${t(l, 'reports.type')}: ${t(l, `reports.type.${c.report_type}` as MessageKey)}`,
      `${t(l, 'reports.generated_at')}: ${c.generated_at.slice(0, 16).replace('T', ' ')}`,
    ],
  };
}

const FONT_CANDIDATES = [
  process.env.REPORT_FONT,
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
].filter(Boolean) as string[];

export async function renderPdf(c: ReportContent, l: Locale): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: c.title, Producer: 'GovMind AI' } });
  const font = FONT_CANDIDATES.find((f) => existsSync(f));
  // Kirill va o'zbek harflari uchun Unicode shrift kerak.
  if (font) doc.font(font);
  const chunks: Buffer[] = [];
  doc.on('data', (b: Buffer) => chunks.push(b));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  const h = header(c, l);
  doc.fontSize(16).text(h.title);
  doc.moveDown(0.5).fontSize(9).fillColor('#444');
  h.lines.forEach((line) => doc.text(line));
  doc.fillColor('#000');

  if (c.commentary?.text) {
    doc.moveDown().fontSize(12).text(t(l, 'reports.ai_commentary'));
    doc.fontSize(9).text(c.commentary.text);
    doc.fontSize(7).fillColor('#666').text(`${t(l, 'reports.ai_disclaimer')} (${c.commentary.model_name} ${c.commentary.model_version})`);
    doc.fillColor('#000');
  }

  for (const tb of tables(c, l)) {
    doc.moveDown().fontSize(12).text(tb.title);
    doc.fontSize(8);
    const width = (doc.page.width - 96) / tb.columns.length;
    const drawRow = (vals: string[], bold = false) => {
      if (doc.y > doc.page.height - 72) doc.addPage();
      const y = doc.y;
      let maxH = 0;
      vals.forEach((v, i) => {
        const opts = { width: width - 4 };
        doc.fillColor(bold ? '#1d3557' : '#000').text(v, 48 + i * width, y, opts);
        maxH = Math.max(maxH, doc.heightOfString(v, opts));
      });
      doc.x = 48;
      doc.y = y + maxH + 3;
    };
    drawRow(tb.columns.map((col) => col.label), true);
    if (tb.rows.length === 0) drawRow([t(l, 'common.none')]);
    tb.rows.forEach((r) => drawRow(tb.columns.map((col) => cell(r, col, l))));
    doc.fillColor('#000');
  }
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

export async function renderXlsx(c: ReportContent, l: Locale): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GovMind AI';
  const info = wb.addWorksheet(t(l, 'reports.summary').slice(0, 31));
  const h = header(c, l);
  info.addRow([h.title]).font = { bold: true, size: 14 };
  h.lines.forEach((line) => info.addRow([line]));
  if (c.commentary?.text) {
    info.addRow([]);
    info.addRow([t(l, 'reports.ai_commentary')]).font = { bold: true };
    info.addRow([c.commentary.text]);
    info.addRow([t(l, 'reports.ai_disclaimer')]).font = { italic: true, size: 9 };
  }
  info.getColumn(1).width = 100;

  tables(c, l).forEach((tb, idx) => {
    const ws = wb.addWorksheet(`${idx + 1}. ${tb.title}`.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    const head = ws.addRow(tb.columns.map((col) => col.label));
    head.font = { bold: true };
    tb.rows.forEach((r) =>
      ws.addRow(
        tb.columns.map((col) => {
          const v = r[col.key];
          return typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) ? Number(v) : cell(r, col, l);
        }),
      ),
    );
    ws.columns.forEach((col) => (col.width = 22));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function renderDocx(c: ReportContent, l: Locale): Promise<Buffer> {
  const h = header(c, l);
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: h.title, heading: HeadingLevel.TITLE }),
    ...h.lines.map((line) => new Paragraph({ children: [new TextRun({ text: line, size: 18, color: '444444' })] })),
  ];
  if (c.commentary?.text) {
    children.push(new Paragraph({ text: t(l, 'reports.ai_commentary'), heading: HeadingLevel.HEADING_2 }));
    c.commentary.text.split('\n').forEach((p) => children.push(new Paragraph(p)));
    children.push(new Paragraph({ children: [new TextRun({ text: t(l, 'reports.ai_disclaimer'), italics: true, size: 16 })] }));
  }
  for (const tb of tables(c, l)) {
    children.push(new Paragraph({ text: tb.title, heading: HeadingLevel.HEADING_2 }));
    const mk = (vals: string[], bold = false) =>
      new TableRow({
        children: vals.map(
          (v) => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: v, bold, size: 18 })] })] }),
        ),
      });
    const body = tb.rows.length ? tb.rows.map((r) => mk(tb.columns.map((col) => cell(r, col, l)))) : [mk([t(l, 'common.none'), ...tb.columns.slice(1).map(() => '')])];
    children.push(
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [mk(tb.columns.map((col) => col.label), true), ...body] }),
    );
  }
  const doc = new Document({ creator: 'GovMind AI', title: c.title, sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export const EXPORT_FORMATS = {
  pdf: { render: renderPdf, mime: 'application/pdf' },
  xlsx: { render: renderXlsx, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  docx: { render: renderDocx, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
} as const;
