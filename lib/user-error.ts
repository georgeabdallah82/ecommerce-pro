// An error whose message was written for the person using the admin or the store, such as
// "Not enough stock for Linen shirt". Only these messages are sent to the browser as they are.
// Any other error is logged on the server and answered with a generic message, so a database or
// code error never reaches the page. `code` lets a screen react to one kind of refusal, such as
// REAUTH_REQUIRED, which asks the person to confirm it is them.
export class UserError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.name = 'UserError'
    this.status = status
    this.code = code
  }
}

export function userError(message: string, status = 400, code?: string) {
  return new UserError(message, status, code)
}
