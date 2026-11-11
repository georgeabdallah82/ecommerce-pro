// CSV for the activity log export. Dependency-free, so it can be tested on its own.

// Spreadsheets run a cell that starts with = + - @ as a formula, so such text gets a leading quote.
// Quotes, commas and line breaks are wrapped in quotes and the quotes doubled.
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

export const ACTIVITY_CSV_HEADER = ['Time', 'Who', 'Email', 'Action', 'Entity', 'Entity ID', 'Details']

export type ActivityCsvRow = { time: string; who: string; email: string; action: string; entity: string; entityId: string; details: string }

// A byte-order mark first, so spreadsheets read the non-Latin names correctly.
export function activityCsv(rows: ActivityCsvRow[]) {
  const lines = [ACTIVITY_CSV_HEADER, ...rows.map(r => [r.time, r.who, r.email, r.action, r.entity, r.entityId, r.details])]
  return '﻿' + lines.map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
