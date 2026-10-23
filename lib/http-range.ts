// "Range: bytes=0-999": how phones and Safari ask for a video a piece at a time. Without answering
// it, iPhones will not play a video at all. Only one range is supported (all a video player sends).
export type ByteRange = { start: number; end: number }

// null = no Range header (send the whole file); 'invalid' = unsatisfiable (answer 416).
export function parseByteRange(header: string | null | undefined, size: number): ByteRange | 'invalid' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid'
  if (!(size > 0)) return 'invalid'
  let start: number, end: number
  if (match[1] === '') {
    // "bytes=-500": the last 500 bytes
    const last = Number(match[2])
    if (!(last > 0)) return 'invalid'
    start = Math.max(0, size - last); end = size - 1
  } else {
    start = Number(match[1]); end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'invalid'
  return { start, end }
}
