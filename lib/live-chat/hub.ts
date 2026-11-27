// The live chat relay: one Cloudflare Durable Object for the store (wrangler.jsonc LIVE_CHAT,
// exported from worker.ts). It holds the open connections of shoppers in a live chat and of staff in
// Admin › Live chat, passes each new message to the other side at once, and keeps the owner's
// "I'm online" switch. Messages themselves are saved in the database by the store's routes; this only
// relays them, so nothing polls the database while people wait.
//
// Connections use the WebSocket hibernation API, so an idle hub costs nothing while sockets stay open.
// The store's routes reach it with POST /presence and POST /publish (lib/live-chat/relay.ts);
// worker.ts forwards a socket here only after checking its signed ticket (lib/live-chat/ticket.ts).

export type Presence = { online: boolean; name: string; since: number | null; staffConnected: number }
export type LiveEvent =
  | { type: 'message'; conversationId: string; message: { id: string; role: 'user' | 'assistant' | 'agent'; text: string; at: string; author?: string } }
  | { type: 'waiting'; conversationId: string; waiting: boolean }
  | { type: 'presence'; online: boolean; name: string }
  // Team chat (lib/team-chat/server.ts): a new or deleted staff message in a channel.
  | { type: 'team'; channelId: string; message: { id: string; authorId: string; authorName: string; text: string; at: string; deleted?: boolean } }

type Socket = { send(data: string): void; close(code?: number, reason?: string): void }
type State = {
  acceptWebSocket(ws: Socket, tags?: string[]): void
  getWebSockets(tag?: string): Socket[]
  storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> }
}

const PRESENCE_KEY = 'presence'

export class LiveChatHub {
  constructor(private state: State, _env: unknown) {}

  private async presence(): Promise<Presence> {
    const saved = await this.state.storage.get<{ online: boolean; name: string; since: number | null }>(PRESENCE_KEY)
    return { online: !!saved?.online, name: saved?.name || '', since: saved?.since ?? null, staffConnected: this.state.getWebSockets('staff').length }
  }

  private send(sockets: Socket[], event: LiveEvent) {
    const data = JSON.stringify(event)
    for (const ws of sockets) {
      try { ws.send(data) } catch { /* a closed socket: dropped by the runtime */ }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.headers.get('Upgrade') === 'websocket') {
      const role = request.headers.get('x-live-role')
      const conversationId = request.headers.get('x-live-conversation') || ''
      const userId = request.headers.get('x-live-user') || ''
      if (role !== 'staff' && !(role === 'shopper' && conversationId) && !(role === 'team' && userId)) return new Response('Forbidden', { status: 403 })
      // @ts-ignore -- WebSocketPair is a Workers runtime global
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [Socket, Socket]
      this.state.acceptWebSocket(server, role === 'staff' ? ['staff'] : role === 'team' ? ['team', `user:${userId}`] : [`chat:${conversationId}`])
      if (role !== 'team') {
        const presence = await this.presence()
        server.send(JSON.stringify({ type: 'presence', online: presence.online, name: presence.name } satisfies LiveEvent))
      }
      // @ts-ignore -- the Workers Response takes the client end of the socket
      return new Response(null, { status: 101, webSocket: client })
    }
    if (url.pathname === '/presence' && request.method === 'GET') return Response.json(await this.presence())
    if (url.pathname === '/presence' && request.method === 'POST') {
      const body = await request.json().catch(() => null) as { online?: unknown; name?: unknown } | null
      const online = body?.online === true
      const name = typeof body?.name === 'string' ? body.name.slice(0, 60) : ''
      await this.state.storage.put(PRESENCE_KEY, { online, name, since: online ? Date.now() : null })
      // Everyone in live chat sees the switch at once (the shop's chat header, other staff devices).
      // (Team chat pages are left out: the switch is about shopper chats.)
      const team = new Set(this.state.getWebSockets('team'))
      this.send(this.state.getWebSockets().filter(ws => !team.has(ws)), { type: 'presence', online, name })
      return Response.json(await this.presence())
    }
    // Team chat: the team room to every staff member's Team chat page, a direct chat only to its two people.
    if (url.pathname === '/team' && request.method === 'POST') {
      const body = await request.json().catch(() => null) as { users?: unknown; event?: LiveEvent } | null
      const event = body?.event
      if (!event || event.type !== 'team') return new Response('Bad request', { status: 400 })
      const sockets = Array.isArray(body?.users)
        ? body.users.filter((id): id is string => typeof id === 'string').flatMap(id => this.state.getWebSockets(`user:${id}`))
        : this.state.getWebSockets('team')
      this.send(sockets, event)
      return Response.json({ ok: true })
    }
    if (url.pathname === '/publish' && request.method === 'POST') {
      const body = await request.json().catch(() => null) as { to?: unknown; event?: LiveEvent } | null
      const event = body?.event
      if (!event || (event.type !== 'message' && event.type !== 'waiting')) return new Response('Bad request', { status: 400 })
      const to = body?.to
      if (to === 'shopper' || to === 'both') this.send(this.state.getWebSockets(`chat:${event.conversationId}`), event)
      if (to === 'staff' || to === 'both') this.send(this.state.getWebSockets('staff'), event)
      return Response.json({ ok: true })
    }
    return new Response('Not found', { status: 404 })
  }

  // Keep-alive pings from the page; nothing else is accepted from a socket (messages go through the
  // store's routes, which check and save them).
  async webSocketMessage(ws: Socket, message: string | ArrayBuffer) {
    if (message === 'ping') ws.send('pong')
  }

  async webSocketClose(ws: Socket, code: number) {
    try { ws.close(code === 1005 ? 1000 : code) } catch { /* already closed */ }
  }
}
