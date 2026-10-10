// Whether the database answers a tiny query in time. Used by GET /api/health, which monitors and
// deploy checks call: a database that hangs counts as down instead of holding the request open.
export async function databaseHealthy(probe: () => Promise<unknown>, timeoutMs = 8000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs) })
  try {
    return await Promise.race([probe().then(() => true, () => false), timeout])
  } finally {
    clearTimeout(timer)
  }
}
