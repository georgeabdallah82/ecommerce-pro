// A product's size guide, typed by the owner as plain lines: the first line is the header, each
// line after it is a size. Cells are separated by "|":
//   Size | Chest (cm) | Length (cm)
//   S | 88-92 | 68
//   M | 96-100 | 70
// Lines are kept as typed (up to 40 rows, 12 cells each); a row with fewer cells is padded.

export type SizeGuide = { header: string[]; rows: string[][] }

export function parseSizeGuide(text: string | null | undefined): SizeGuide | null {
  const lines = (text || '').split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const cells = (line: string) => line.split('|').map(cell => cell.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40))
  const header = cells(lines[0]).slice(0, 12)
  const width = header.length
  if (width < 2) return null
  const rows = lines.slice(1, 41).map(line => {
    const row = cells(line).slice(0, width)
    while (row.length < width) row.push('')
    return row
  })
  return { header, rows }
}
