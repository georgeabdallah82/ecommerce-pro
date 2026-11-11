// An error whose message was written for the person using the admin or the store, such as
// "Not enough stock for Linen shirt". Only these messages are sent to the browser as they are.
// Any other error is logged on the server and answered with a generic message, so a database or
// code error never reaches the page.
export class UserError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'UserError'
    this.status = status
  }
}

export function userError(message: string, status = 400) {
  return new UserError(message, status)
}
