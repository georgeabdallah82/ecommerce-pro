import { requirePermission } from '@/lib/auth'
import LiveChatInbox from '@/components/admin-live-chat'

// Admin › Online Store › Live chat: answer shoppers in the shop's chat window. Docs: docs/live-chat-2026-11.md.
export default async function LiveChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requirePermission('assistant.view')
  const c = (await searchParams).c
  return <LiveChatInbox initialId={typeof c === 'string' && /^[a-z0-9]{10,40}$/i.test(c) ? c : null} />
}
