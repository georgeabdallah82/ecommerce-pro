import { notFound } from 'next/navigation'
import Link from '@/components/admin-link'
import { requirePermission } from '@/lib/auth'
import { conversationDetail } from '@/lib/assistant/admin'
import ui from '@/components/admin-ui.module.css'
import styles from '@/components/admin-assistant.module.css'

// Admin › AI assistant › one conversation, as the shopper saw it (contact details hidden).

const KIND: Record<string, string> = { ai: 'AI answer', action: 'Button', fallback: 'Shop search (AI unavailable)', limit: 'Shop search (AI off or budget used)', message: '' }

export default async function AssistantConversation({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('assistant.view')
  const { id } = await params
  const chat = /^[a-z0-9]{10,40}$/i.test(id) ? await conversationDetail(id) : null
  if (!chat) notFound()
  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div>
        <Link href="/admin/online-store/assistant?tab=chats" className={ui.textLink}>← Conversations</Link>
        <h1 className={ui.title}>Conversation</h1>
        <p className={ui.muted}>
          Started {chat.createdAt.toLocaleString('en-GB')} · {chat.messageCount} messages · AI cost ${chat.costUsd.toFixed(3)}
          {chat.customer ? <> · <Link href={`/admin/customers/${chat.customer.id}`}>{chat.customer.name}</Link></> : ' · Guest'}
        </p>
      </div>
      <div className={styles.pills}>
        {chat.unanswered ? <span className={`${ui.statusPill} ${ui.statusPillWarning}`}>Has an unanswered question</span> : null}
        {chat.escalated ? <span className={ui.statusPill}>Shown support contacts</span> : null}
      </div>
    </div>
    <section className={`${styles.panel} ${styles.transcript}`}>
      {chat.messages.map(m => (
        <div key={m.id} className={m.role === 'user' ? styles.fromShopper : styles.fromAssistant}>
          <div className={styles.meta}>{m.role === 'user' ? 'Shopper' : 'Assistant'}{KIND[m.kind] ? ` · ${KIND[m.kind]}` : ''}{m.role === 'assistant' && !m.answered ? ' · could not answer' : ''} · {m.createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
          <p dir="auto">{m.text}</p>
          {m.products.length ? <ul className={styles.productList}>{m.products.map(p => <li key={p.id}><Link href={`/admin/products/${p.id}`}>{p.name}</Link></li>)}</ul> : null}
        </div>
      ))}
    </section>
  </div>
}
