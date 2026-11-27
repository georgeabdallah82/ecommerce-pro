import { requireStaff } from '@/lib/auth'
import TeamChat from '@/components/admin-team-chat'

// Admin › Team chat: the staff's own messages. Docs: docs/team-chat-2026-11.md.
export default async function TeamChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requireStaff()
  const c = (await searchParams).c
  return <TeamChat initialChannel={typeof c === 'string' && /^[a-z0-9]{10,40}$/i.test(c) ? c : null} />
}
