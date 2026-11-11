// How long a staff sign-in lasts. Staff sign in again after a shift, so a cookie left in a shared
// browser stops working. Customers keep the 30-day session. Dependency-free, so proxy.ts can use it.
export const STAFF_SESSION_SECONDS = 12 * 60 * 60

export function staffSessionEnded(role: string, issuedAtSeconds: number, nowSeconds: number) {
  return role !== 'CUSTOMER' && nowSeconds - issuedAtSeconds > STAFF_SESSION_SECONDS
}
