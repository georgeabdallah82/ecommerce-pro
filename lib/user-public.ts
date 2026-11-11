// The columns of a user row an admin screen may receive. Order screens include the customer on the
// order and the staff member who wrote a note; they do it through this select only, so the password
// hash, the two-step secret, the backup-code hashes and the session cut-off never reach a browser.
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  staffRoleId: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
  totpEnabledAt: true,
} as const
