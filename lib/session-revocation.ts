// True when a token issued at `issuedAtSeconds` predates the account's last session revocation
// (password, email or role change, account disabled). Dependency-free so proxy.ts can use it.
export function isSessionRevoked(issuedAtSeconds: number, sessionsRevokedAt: Date | null | undefined) {
  if (!sessionsRevokedAt) return false
  return issuedAtSeconds < Math.floor(sessionsRevokedAt.getTime() / 1000)
}
