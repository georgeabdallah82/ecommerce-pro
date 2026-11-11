// A link an admin types (a parcel's tracking page) is shown to staff and then to customers, so only a
// web address is stored. javascript:, data: and relative values are refused.
const MAX_LENGTH = 500

export function safeHttpUrl(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text || text.length > MAX_LENGTH) return null
  try {
    const { protocol, hostname } = new URL(text)
    return (protocol === 'https:' || protocol === 'http:') && hostname ? text : null
  } catch {
    return null
  }
}
