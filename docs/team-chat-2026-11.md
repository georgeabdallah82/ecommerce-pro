# Team chat (November 2026)

Branch `claude/team-chat`.

A chat for the staff inside the admin: **Admin › Home › Team chat** (on phones, under More).

## What it does

**Who.** Every staff account is in it, whatever their role or permissions. Customers are not. Drivers have no staff account, so they are not in it.

**Team room.** One conversation for the whole staff. Each person's unread count starts from when they first open it, so they don't get a flood of old messages.

**Direct chats.** **+ New chat** (top of the chat list) lists every other staff member, with search once there are more than 5.
- Picking someone opens your chat with them, or starts it.
- If you are the only staff member, it says so and links to Users & roles to invite someone.
- A direct chat is private between the two people. There is one per pair, whoever starts it. Only those two can read it; anyone else gets "Not found".

**Instant delivery.** Messages arrive at once (about 0.1 s in the local test) through the live chat relay, the `LiveChatHub` Durable Object.
- A chat that is open is marked read as messages come in.
- Other chats show an unread count.
- **Team chat** in the admin menu shows the total unread count, updated on each page load.

**Phone notifications.** They go out for every message, using the same staff alerts as orders, on the devices where they're turned on.
- One notification per chat is kept on a device; the next one replaces it.
- The bell in a chat's header mutes or unmutes it, per person and per chat.
- Nobody gets a notification for their own message.

**Order links.** Typing `#1042` or `ORD-…` makes a link. It opens the order through `/admin/orders/number/<number>`, for staff who can see orders.

**Deleting.** Anyone can delete their own messages; the owner (super admin) can delete anyone's.
- It asks first.
- Everyone in that chat sees "Message deleted" at once.
- Each delete is recorded in the activity log (`teamchat.message.deleted`).

**Kept 90 days.** The daily job deletes older messages (`pruneTeamChat`).

**Limits.** Messages can be up to 2,000 characters, and each person can send at most 60 a minute.

## How it's built

**Tables** (migration `20261127140000_team_chat`, additive only):
- `StaffChannel`: `key` is "team" or "dm:<id>:<id>";
- `StaffMessage`;
- `StaffChannelMember`: read mark and mute.

**Server:** `lib/team-chat/server.ts`. The chat list takes two queries for all chats together, so it stays well under the Workers Free limit of 50 outside calls per request.

**API:** `app/api/admin/team-chat` (any staff member: `requireStaff`).
- `GET` returns the list and a connection ticket, or with `?c=` a chat's messages.
- `POST` takes `send`, `read`, `mute`, `delete` or `dm`.

**Relay.** The connection ticket has a new `team` role naming the staff member (`lib/live-chat/ticket.ts`).
- The hub tags those sockets `team` and `user:<id>`.
- The team room goes to every Team chat page.
- A direct chat goes only to its two people.
- Shoppers' chats, the Live chat inbox and the "online" switch are kept apart from Team chat.

**Page:** `app/admin/team-chat`, `components/admin-team-chat.tsx`, `admin-team-chat.module.css`.

**Menu.** The entry uses the new `permission: 'staff'` value (every staff member), with an unread badge from `unreadTotal`.

**Phone alert:** `sendTeamChatPush` in `lib/push.ts`.

## Tested

**Unit tests** (`tests/team-chat.test.ts`) cover:
- the team ticket;
- the room reaching all staff but not shoppers or the Live chat inbox;
- a direct chat reaching only its two people;
- the online switch not going to Team chat;
- one direct chat per pair;
- access rules;
- delete rules and logging;
- retention;
- the two-query chat list.

**End to end** on `wrangler dev` (the Cloudflare runtime) with the local database and two browsers: the owner, and "Rami" (Support, signed in through the real 2-step set-up).
- Rami saw the menu entry, and got the owner's team room message in 103 ms.
- `#1002` became a link and opened the order.
- Rami started a direct chat; it appeared for the owner live with unread 1.
- Replies went both ways live.
- Rami deleted his own message, and the owner saw "Message deleted" live.
- Rami deleting the owner's message was refused (403), and an unknown chat gave 404.
- Rami's menu showed the unread badge.
- Mute was kept after a reload.
- The phone layout shows the list, then the chat.

## Not done / limits

- **No typing indicator, read receipts, file or photo attachments, or message editing.**
- **No group chats** other than the team room.
- **The menu badge updates when a page loads,** not live; the Team chat page itself is live.
- **Under `next dev`** there is no relay: messages from others show when a chat is reopened. A note on the page says so.
