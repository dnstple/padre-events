/**
 * CSV generation with spreadsheet-formula-injection protection.
 *
 * A guest called `=cmd|'/c calc'!A0` would otherwise execute on open in Excel.
 * Any cell whose first character can start a formula is prefixed with a single
 * quote and the whole cell is quoted, which Excel, Numbers and Sheets all treat
 * as literal text.
 */

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function escapeCsvCell(input: unknown): string {
  let value = input === null || input === undefined ? "" : String(input);

  // Collapse control characters — they can break row parsing or hide content.
  value = value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();

  if (value.length > 0 && FORMULA_TRIGGERS.has(value[0])) {
    value = `'${value}`;
  }

  // Always quote, and double any embedded quotes.
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  const body = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  // UTF-8 BOM so Excel reads accented names correctly.
  return `﻿${body}\r\n`;
}
