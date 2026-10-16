import { code128Bars } from '@/lib/code128'

// Sticker sizes for Products > Barcode stickers: the common A4 sticker sheets, which fill the
// page edge to edge, and a small label printer roll (one sticker per printed page).
export const LABEL_LAYOUTS = {
  a4_24: { label: 'A4 sheet, 24 per page (70 x 37 mm)', paper: 'A4', page: 'A4', cols: 3, w: 70, h: 37, perPage: 24 },
  a4_40: { label: 'A4 sheet, 40 per page (52.5 x 29.7 mm)', paper: 'A4', page: 'A4', cols: 4, w: 52.5, h: 29.7, perPage: 40 },
  roll_50x30: { label: 'Label printer (50 x 30 mm)', paper: '50 x 30 mm', page: '50mm 30mm', cols: 1, w: 50, h: 30, perPage: 1 },
} as const
export type LabelLayoutKey = keyof typeof LABEL_LAYOUTS

// The stickers split into printed pages.
export function labelPages<T>(stickers: T[], layout: LabelLayoutKey): T[][] {
  const per = LABEL_LAYOUTS[layout].perPage
  const pages: T[][] = []
  for (let i = 0; i < stickers.length; i += per) pages.push(stickers.slice(i, i + per))
  return pages
}

// How wide the thinnest bar prints, in mm. Under about 0.25 mm phone cameras struggle.
export function moduleWidthMm(code: string, layout: LabelLayoutKey) {
  const size = LABEL_LAYOUTS[layout]
  return (size.w - 5) / code128Bars(code).width
}
