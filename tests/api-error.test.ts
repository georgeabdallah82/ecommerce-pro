import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { routeError } from '@/lib/api-error'
import { userError } from '@/lib/user-error'
import { json } from '@/lib/utils'

const body = async (r: Response) => [r.status, (await r.json()).error] as const
const prismaError = () => Object.assign(new Error('\nInvalid `prisma.order.update()` invocation:\n\nTransaction already closed'), { name: 'PrismaClientKnownRequestError', code: 'P2028' })

describe('API error replies (HI-02 / HI-04)', () => {
  it('keeps messages written for the user, with the status the error carries or else the route status', async () => {
    assert.deepEqual(await body(routeError(userError('SKU is required'), 'Unable to save', 400)), [400, 'SKU is required'])
    assert.deepEqual(await body(routeError(userError('Duplicate variant SKU: P1001', 409), 'Unable to save', 400)), [409, 'Duplicate variant SKU: P1001'])
  })
  it('answers a plain error with a generic line, never with its own text', async () => {
    assert.deepEqual(await body(routeError(new Error('SKU is required'), 'Unable to save', 400)), [500, 'Something went wrong on our side. Please try again.'])
    assert.deepEqual(await body(routeError(new Error('Duplicate variant SKU: P1001'), 'Unable to save', 500)), [500, 'Unable to save'])
  })
  it('maps sign-in and permission errors', async () => {
    assert.equal((await body(routeError(new Error('UNAUTHORIZED'), 'x', 400)))[0], 401)
    assert.equal((await body(routeError(new Error('FORBIDDEN'), 'x', 403)))[0], 403)
  })
  it('hides database, network and code failures behind a 500', async () => {
    for (const e of [prismaError(), new TypeError("Cannot read properties of undefined (reading 'id')"), new Error('fetch failed'), 'a thrown string']) {
      const [status, message] = await body(routeError(e, 'Unable to update order', 400))
      assert.equal(status, 500)
      assert.doesNotMatch(String(message), /prisma|invocation|Cannot read|fetch failed|string/i)
    }
  })
  it('treats bad request bodies, validation and duplicates as client errors', async () => {
    assert.equal((await body(routeError(new SyntaxError('Unexpected token } in JSON'), 'x', 400)))[0], 400)
    assert.equal((await body(routeError(Object.assign(new Error('[{"path":["email"]}]'), { name: 'ZodError' }), 'x', 400)))[0], 400)
    assert.deepEqual(await body(routeError(Object.assign(new Error('Unique constraint failed on the fields: (`sku`)'), { code: 'P2002' }), 'x', 400)), [409, 'That value is already used by another record.'])
  })
  it('json() scrubs internal text from any error reply as a last line of defence', async () => {
    const [status, message] = await body(json({ error: prismaError().message }, { status: 400 }))
    assert.equal(status, 500); assert.doesNotMatch(String(message), /prisma/i)
    assert.deepEqual(await body(json({ error: 'Not enough stock' }, { status: 409 })), [409, 'Not enough stock'])
  })
})
