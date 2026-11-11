// Code 128 barcodes for the printed stickers (Products > Barcode stickers). Phone cameras
// (Stock count), shop scanners and Google Lens all read them. Letters and digits use code set B;
// a run of 4 or more digits switches to set C, two digits per symbol, so long numbers stay short.

import { userError } from '@/lib/user-error'

// Bar and space widths for each symbol value 0-106 (106 is the stop, with its final bar).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106

// Only plain printable characters (space to ~) can be put in a sticker's barcode.
export const canEncode = (text: string) => text.length > 0 && text.length <= 40 && /^[\x20-\x7e]+$/.test(text)

// The symbol values for `text`, start and check symbol included, stop excluded.
export function code128Values(text: string): number[] {
  if (!canEncode(text)) throw userError('This code has characters a barcode cannot hold')
  const values: number[] = []
  let set: 'B' | 'C' | '' = ''
  let i = 0
  const digitsAhead = (from: number) => { let n = 0; while (from + n < text.length && text[from + n] >= '0' && text[from + n] <= '9') n++; return n }
  while (i < text.length) {
    const run = digitsAhead(i)
    // Set C for 4+ digits (or a code that is only digits, 2+), an even number of them.
    const useC = (run >= 4 || (run >= 2 && run === text.length)) && run >= 2
    if (useC) {
      const pairs = Math.floor(run / 2)
      if (set !== 'C') { values.push(set ? CODE_C : START_C); set = 'C' }
      for (let p = 0; p < pairs; p++) { values.push(Number(text.slice(i, i + 2))); i += 2 }
      continue
    }
    if (set !== 'B') { values.push(set ? CODE_B : START_B); set = 'B' }
    values.push(text.charCodeAt(i) - 32)
    i++
  }
  const check = values.reduce((sum, v, index) => sum + v * (index === 0 ? 1 : index), 0) % 103
  return [...values, check]
}

// The bars as [x, width] in modules (the narrowest bar is 1), and the total width with the
// 10-module quiet zone on each side that scanners need.
export function code128Bars(text: string) {
  const symbols = [...code128Values(text), STOP].map(v => PATTERNS[v])
  const bars: Array<[number, number]> = []
  let x = 10
  for (const pattern of symbols) {
    for (let k = 0; k < pattern.length; k++) {
      const width = Number(pattern[k])
      if (k % 2 === 0) bars.push([x, width])
      x += width
    }
  }
  return { bars, width: x + 10 }
}

// The SVG path for the bars (each bar as a rectangle `height` tall).
export function code128Path(text: string, height: number) {
  const { bars, width } = code128Bars(text)
  return { d: bars.map(([x, w]) => `M${x},0h${w}v${height}h-${w}z`).join(''), width }
}
