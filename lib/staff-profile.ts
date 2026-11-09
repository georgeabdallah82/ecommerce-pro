// A staff member's own profile (Admin > My profile): the name shown in the admin, and an optional
// photo. Used by app/api/admin/profile.

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

// Returns the cleaned name, or the reason it can't be saved.
export function cleanStaffName(value: unknown): { name: string } | { error: string } {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (name.length < 2) return { error: 'Please enter your name (at least 2 letters).' }
  if (name.length > 80) return { error: 'Please keep your name under 80 characters.' }
  if (/[\u0000-\u001f\u007f<>]/.test(name)) return { error: 'Your name contains characters that are not allowed.' }
  return { name }
}
