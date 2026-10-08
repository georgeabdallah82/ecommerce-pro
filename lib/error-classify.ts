// Telling an error meant for the user ("SKU is required") from an internal failure (a database,
// network or code error) whose text must not reach the browser (audit HI-02/HI-04).
const INTERNAL_NAMES = new Set(['TypeError', 'ReferenceError', 'RangeError', 'EvalError', 'URIError', 'AbortError', 'TimeoutError', 'InternalError'])
const INTERNAL_TEXT = /prisma|invalid `|invocation|cannot read prop|cannot set prop|is not a function|is not defined|is not iterable|undefined is not|null is not|unexpected token|fetch failed|econn|etimedout|enotfound|socket hang|network ?error|accelerate|transaction api|transaction already closed|timed out fetching|connection (?:refused|reset|closed)|stack:|\bat [\w.<>]+ \(|\/node_modules\/|\.tsx?:\d+|mongo|replica set|unique constraint|foreign key/i

export function isInternalErrorMessage(message: string) {
  return message.length > 300 || INTERNAL_TEXT.test(message)
}

export function isInternalError(e: unknown) {
  if (!(e instanceof Error)) return true
  if (INTERNAL_NAMES.has(e.name) || e.name.startsWith('PrismaClient')) return true
  const code = (e as { code?: unknown }).code
  if (typeof code === 'string' && /^P\d{4}$/.test(code)) return true
  return isInternalErrorMessage(e.message)
}

export function isUniqueConflict(e: unknown) {
  return (e as { code?: unknown } | null)?.code === 'P2002' || /unique constraint/i.test(e instanceof Error ? e.message : '')
}

export const GENERIC_SERVER_ERROR = 'Something went wrong on our side. Please try again.'
