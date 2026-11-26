# Live chat (November 2026)

Branch `claude/live-chat`.

The store's people can answer shoppers in the same chat window as the AI shopping assistant (`docs/ai-assistant-2026-11.md`).

## How it works

**The switch.** Admin › Online Store › **Live chat** has a **Go online / Go offline** switch.
- While online, shoppers' typed messages go to the store instead of the AI. The shopper sees "Chat with George · Online now".
- While offline, the AI (or the shop search) answers as before.
- The buttons (best sellers, track my order, and so on) always answer right away from the store's data.

**A shopper writes.** The chat shows "Sent. George will reply here."
- The message appears in Admin › Live chat at once. Waiting chats come first, with how long each shopper has waited.
- The first message of a wait sends a **phone notification** to the staff devices where "Order alerts" are on. Tapping it opens that chat.

**Staff reply.** The reply reaches the shopper's chat window at once (about 0.1 s in the local test).
- If the shopper had closed the window, a red dot shows on the chat button.
- Replies sent while their page was closed show when they open the chat again.

**No reply in 3 minutes.** The AI answers what the shopper wrote and adds "Our team will also reply here as soon as they can."
- If no AI is available, the shopper gets "Thanks for your message! Our team will reply here…" with the WhatsApp and email buttons.
- The chat stays in the inbox as waiting until a person replies.
- The server checks the 3 minutes and lets the AI step in only once per wait.

**Who can answer.** Staff with "AI shopping assistant: see" (`assistant.view`), which includes the Support role, can answer and use the switch. Going online and offline is recorded in the activity log.

## How it's built

**The relay** is a Cloudflare Durable Object, `LiveChatHub` (`lib/live-chat/hub.ts`).
- It is bound as `LIVE_CHAT` in `wrangler.jsonc` and exported from `worker.ts`.
- It is SQLite-backed, so it works on the Workers Free plan.
- It holds the open connections (WebSocket hibernation, so idle connections cost nothing) and the online switch.
- It passes each new message to the other side. Nothing polls the database while people wait, which matters with the Neon free plan's hours.

**Messages are saved by the store's routes,** in the assistant's tables:
- `AssistantMessage`, with role `agent` and the staff member's first name in `author`;
- `AssistantConversation.live` and `waitingSince`.

Migration `20261127090000_live_chat` is additive only. Chats are deleted after 90 days, like the assistant's.

**Connections** go to `/api/live-chat/socket`.
- `worker.ts` handles them before Next.js.
- They need a signed 10-minute ticket (`lib/live-chat/ticket.ts`, HMAC with `AUTH_SECRET`) and must come from this site's pages.
- Shoppers get a ticket for their own chat only (`app/api/assistant/live`, checked by the chat cookie).
- Staff get one from `app/api/admin/live-chat`.
- A shopper's socket receives only their own chat's messages.

**What is saved.** Live messages keep phone numbers and emails the shopper types on purpose; they are talking to the store, as on WhatsApp. Card-like numbers are still hidden. AI chats keep hiding contact details as before.

**Code:**
- Store side: `lib/live-chat/relay.ts`, `server.ts`
- Endpoints: `app/api/assistant/route.ts` (live mode, `ai_fallback`), `app/api/assistant/live`, `app/api/admin/live-chat`
- Shop chat window: `components/assistant-widget.tsx`
- Inbox: `components/admin-live-chat.tsx`
- Page: `app/admin/online-store/assistant/live`
- Alert: `sendLiveChatAlert` in `lib/push.ts`

## Tested

**Unit tests** (`tests/live-chat.test.ts`) cover:
- tickets: valid, changed, expired, wrong secret, shopper without a chat;
- the relay: the switch reaches every connection, and a reply goes only to its chat and to staff;
- the socket refusing a missing role;
- the wiring;
- card-only hiding.

**End to end** on `wrangler dev` (the Cloudflare runtime, Durable Object included) against the local database, with two browsers:
- The owner went online, and the shopper saw "Chat with Store · Online now".
- The shopper's message showed in the owner's inbox without a reload.
- The owner's reply reached the shopper in 124 ms, and the shopper's next message reached the owner live.
- The owner went offline, and the shopper's header switched back at once.

**API level:**
- The fallback does nothing before 3 minutes.
- After 3 minutes it answered once, with the support buttons, since there was no AI locally.
- A second try did nothing.
- Another browser got no ticket and no messages for that chat.
- A forged ticket was refused on the socket.
- After going offline, messages went back to the AI/search path.

**Locally under `next dev`** there is no relay (Wrangler warns about the internal Durable Object). The store counts as offline and the AI answers.

## Not done / limits

- **No typing indicator or read receipts.**
- **One shared online switch for the whole store.** Any staff member can turn it on or off; replies show each person's first name.
- **The 3-minute timer runs in the shopper's open page.** If they leave before then, the AI doesn't answer; the staff reply waits in the chat for when they come back.
- **No sign-off message** when you go offline mid-chat. The shopper's next message goes to the AI.
