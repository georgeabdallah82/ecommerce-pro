import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { resetTransactionState, runInteractiveTransaction } from '@/lib/prisma'

// A stand-in for the database client's $transaction: `behave` decides what each attempt does.
function fakeClient(behave: (attempt: number, options: any, run: () => Promise<any>) => Promise<any>) {
  let attempt = 0
  const calls: any[] = []
  return {
    calls,
    async $transaction(fn: (tx: any) => Promise<any>, options: any) {
      calls.push(options)
      return behave(attempt++, options, () => fn({ isTx: true }))
    },
  }
}
const prismaError = (code: string, message = 'x') => Object.assign(new Error(message), { name: 'PrismaClientKnownRequestError', code })

beforeEach(() => resetTransactionState())

describe('runInteractiveTransaction', () => {
  it('runs the work inside a real transaction with the longer limit', async () => {
    const client = fakeClient((_a, _o, run) => run())
    const seen: any[] = []
    const result = await runInteractiveTransaction(client, async tx => { seen.push(tx.isTx); return 'done' })
    assert.equal(result, 'done')
    assert.deepEqual(seen, [true])
    assert.equal(client.calls[0].timeout, 15_000)
  })

  it('passes errors from the work itself straight through, without running it again', async () => {
    let runs = 0
    const client = fakeClient((_a, _o, run) => run())
    await assert.rejects(runInteractiveTransaction(client, async () => { runs++; throw new Error('Out of stock') }), /Out of stock/)
    await assert.rejects(runInteractiveTransaction(client, async () => { runs++; throw prismaError('P2002', 'Unique constraint failed') }), /Unique constraint/)
    assert.equal(runs, 2)
  })

  it('runs the steps one by one when the transaction times out part-way (it was rolled back)', async () => {
    const txMarker = { isTx: true }
    const runs: string[] = []
    const client = { async $transaction(fn: (tx: any) => Promise<any>) { await fn(txMarker); throw prismaError('P2028', 'Transaction already closed') } }
    await runInteractiveTransaction(client, async tx => { runs.push(tx === txMarker ? 'transaction' : 'step by step') })
    assert.deepEqual(runs, ['transaction', 'step by step'])
  })

  it('does not run the work again when only the commit answer was lost', async () => {
    let runs = 0
    const client = fakeClient(async (_a, _o, run) => { await run(); throw prismaError('P5006', 'Unknown server error') })
    await assert.rejects(runInteractiveTransaction(client, async () => { runs++ }), /Unknown server error/)
    assert.equal(runs, 1)
  })

  it('retries a write conflict in a new transaction', async () => {
    let runs = 0
    const client = fakeClient(async (attempt, _o, run) => { await run(); if (attempt === 0) throw prismaError('P2034', 'Write conflict'); return 'ok' })
    assert.equal(await runInteractiveTransaction(client, async () => { runs++; return 'ok' }), 'ok')
    assert.equal(runs, 2)
  })

  it('drops the longer limit if the database refuses it, then keeps using the default', async () => {
    const client = fakeClient(async (attempt, options, run) => { if (options.timeout) throw prismaError('P5011', 'Invalid timeout'); return run() })
    await runInteractiveTransaction(client, async () => 'ok')
    await runInteractiveTransaction(client, async () => 'ok')
    assert.deepEqual(client.calls.map(o => o.timeout), [15_000, undefined, undefined])
  })
})
