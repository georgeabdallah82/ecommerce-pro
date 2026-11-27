import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LiveEvent, Presence } from './hub'

// The store's side of the live chat relay (lib/live-chat/hub.ts). Without the Durable Object
// (next dev, tests) the owner simply counts as offline and nothing is relayed: the AI answers.

type Stub = { fetch(input: string, init?: RequestInit): Promise<Response> }

async function hub(): Promise<Stub | null> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    const namespace = (env as unknown as { LIVE_CHAT?: { idFromName(name: string): unknown; get(id: unknown): Stub } }).LIVE_CHAT
    if (!namespace) return null
    return namespace.get(namespace.idFromName('hub'))
  } catch {
    return null
  }
}

export const OFFLINE: Presence = { online: false, name: '', since: null, staffConnected: 0 }

export async function getPresence(): Promise<Presence> {
  const stub = await hub()
  if (!stub) return OFFLINE
  try {
    const res = await stub.fetch('https://live-chat/presence')
    return res.ok ? await res.json() as Presence : OFFLINE
  } catch (error) {
    console.error('[live-chat] presence unavailable', error instanceof Error ? error.message : error)
    return OFFLINE
  }
}

export async function setPresence(online: boolean, name: string): Promise<Presence | null> {
  const stub = await hub()
  if (!stub) return null
  const res = await stub.fetch('https://live-chat/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ online, name }) })
  return res.ok ? await res.json() as Presence : null
}

// Passing a message on is best-effort: it is already saved, and the other side also reads it when
// their chat (re)opens.
export async function publish(to: 'shopper' | 'staff' | 'both', event: Extract<LiveEvent, { type: 'message' | 'waiting' }>) {
  const stub = await hub()
  if (!stub) return
  try {
    await stub.fetch('https://live-chat/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, event }) })
  } catch (error) {
    console.error('[live-chat] relay failed', error instanceof Error ? error.message : error)
  }
}

export const liveRelayAvailable = async () => (await hub()) !== null

// Team chat (lib/team-chat/server.ts): to everyone on Team chat, or only to the listed staff members.
export async function publishTeam(users: string[] | null, event: Extract<LiveEvent, { type: 'team' }>) {
  const stub = await hub()
  if (!stub) return
  try {
    await stub.fetch('https://live-chat/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ users, event }) })
  } catch (error) {
    console.error('[team-chat] relay failed', error instanceof Error ? error.message : error)
  }
}
