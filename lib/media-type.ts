// Works out what an uploaded image really is from its first bytes. The browser's own type
// (file.type) is whatever the uploader's device says, so it is never trusted on its own.
export type UploadImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/svg+xml'

export function sniffUploadImageType(bytes: Uint8Array): UploadImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  // PNG starts with a byte above 0x7f, so it is compared byte by byte, not as text.
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'image/png'
  const head = new TextDecoder().decode(bytes.subarray(0, 512))
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif'
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp'
  // SVG logos are allowed (the store logo is one). They are only ever served with the sandboxed
  // headers in app/api/media, so a script inside one cannot run on the store.
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'image/svg+xml'
  return null
}
