import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

export type Format = 'csv' | 'xlsx' | 'json';

export function detectFormat(filename: string, mime: string): Format | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'csv' || mime === 'text/csv') return 'csv';
  if (ext === 'xlsx' || mime.includes('spreadsheetml')) return 'xlsx';
  if (ext === 'json' || mime === 'application/json') return 'json';
  return null;
}

export async function parseRows(buf: Buffer, format: Format, maxRows = 5000): Promise<Record<string, unknown>[]> {
  let out: Record<string, unknown>[];
  if (format === 'csv') {
    out = parse(buf, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true });
  } else if (format === 'json') {
    const data = JSON.parse(buf.toString('utf8'));
    if (!Array.isArray(data)) throw new Error('JSON must be an array of objects');
    out = data;
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    out = [];
    ws.eachRow((row, idx) => {
      const values = (row.values as unknown[]).slice(1);
      if (idx === 1) {
        values.forEach((v) => headers.push(String(v ?? '').trim().toLowerCase()));
        return;
      }
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        const v = values[i] as any;
        obj[h] = v instanceof Date ? v.toISOString() : v && typeof v === 'object' && 'text' in v ? v.text : v;
      });
      out.push(obj);
    });
  }
  if (out.length > maxRows) throw new Error(`Too many rows (max ${maxRows})`);
  return out;
}

export async function writeRows(rows: Record<string, unknown>[], columns: string[], format: Format): Promise<Buffer> {
  if (format === 'json') return Buffer.from(JSON.stringify(rows, null, 2));
  if (format === 'csv') return Buffer.from('﻿' + stringify(rows, { header: true, columns }));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('data');
  ws.addRow(columns).font = { bold: true };
  rows.forEach((r) => ws.addRow(columns.map((c) => (r[c] instanceof Date ? (r[c] as Date).toISOString() : r[c]))));
  ws.columns.forEach((c) => (c.width = 24));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const MIME: Record<Format, string> = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
