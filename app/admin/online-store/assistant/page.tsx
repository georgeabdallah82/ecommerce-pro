import Link from '@/components/admin-link'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { ASSISTANT_MODELS } from '@/lib/assistant/config'
import { loadAssistantConfigFresh } from '@/lib/assistant/settings'
import { assistantKeyConfigured, providerReady, resolveModel } from '@/lib/assistant/engine'
import { workersAiConfigured } from '@/lib/assistant/workers-ai'
import { CHAT_FILTERS, assistantReport, listConversations, type ChatFilter } from '@/lib/assistant/admin'
import AssistantSettings from '@/components/admin-assistant-settings'
import AssistantFaqs from '@/components/admin-assistant-faqs'
import ui from '@/components/admin-ui.module.css'
import styles from '@/components/admin-assistant.module.css'

// Admin › Online Store › AI assistant: usage and cost, the chats, the FAQ answers and the settings.
// Docs: docs/ai-assistant-2026-11.md.

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'chats', label: 'Conversations' },
  { key: 'faq', label: 'FAQ answers' },
  { key: 'settings', label: 'Settings' },
] as const
type Tab = typeof TABS[number]['key']

const usd = (n: number) => `$${n < 1 && n > 0 ? n.toFixed(3) : n.toFixed(2)}`
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const LANG: Record<string, string> = { en: 'English', ar: 'Arabic', arabizi: 'Lebanese (Latin letters)' }

export default async function AssistantAdmin({ searchParams }: { searchParams: Promise<{ tab?: string; filter?: string; page?: string }> }) {
  const user = await requirePermission('assistant.view')
  const canManage = hasPermission(user, 'assistant.manage')
  const params = await searchParams
  const tab: Tab = TABS.some(t => t.key === params.tab) ? params.tab as Tab : 'overview'
  const config = await loadAssistantConfigFresh()
  const model = resolveModel(config.model)
  const keyConfigured = providerReady(model)
  const ready = { anthropic: assistantKeyConfigured(), cloudflare: workersAiConfigured() }

  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>ONLINE STORE</span>
        <h1 className={ui.title}>AI shopping assistant</h1>
        <p className={ui.muted}>
          {config.enabled ? 'On' : 'Off'} · {ASSISTANT_MODELS[model].label} · {ASSISTANT_MODELS[model].provider === 'cloudflare' ? 'free (stops at Cloudflare\'s daily allowance)' : `budget ${usd(config.dailyBudgetUsd)} a day`}
          {keyConfigured ? '' : ' · AI keys not set (answers use your shop search)'}
        </p>
      </div>
      <span className={`${ui.statusPill} ${config.enabled ? ui.statusPillSuccess : ui.statusPillWarning}`}>{config.enabled ? 'Showing on the shop' : 'Hidden from shoppers'}</span>
    </div>

    <nav className={styles.tabs} aria-label="AI assistant sections">
      {TABS.map(t => <Link key={t.key} href={`/admin/online-store/assistant${t.key === 'overview' ? '' : `?tab=${t.key}`}`} aria-current={tab === t.key ? 'page' : undefined} className={tab === t.key ? styles.tabOn : undefined}>{t.label}</Link>)}
      <Link href="/admin/online-store/assistant/live">Live chat</Link>
    </nav>

    {tab === 'overview' ? await Overview() : null}
    {tab === 'chats' ? await Chats(CHAT_FILTERS.includes(params.filter as ChatFilter) ? params.filter as ChatFilter : 'all', Math.max(1, Number(params.page) || 1)) : null}
    {tab === 'faq' ? await Faq(canManage) : null}
    {tab === 'settings' ? <AssistantSettings initial={config} canManage={canManage} ready={ready} /> : null}
  </div>
}

async function Overview() {
  const r = await assistantReport(new Date(), 30)
  const answers = r.aiAnswers + r.actionAnswers + r.fallbackAnswers
  return <>
    <div className={styles.stats}>
      <div className={styles.stat}><span>Chats (30 days)</span><strong>{r.chats.toLocaleString()}</strong><small>{answers.toLocaleString()} answers</small></div>
      <div className={styles.stat}><span>AI answers</span><strong>{r.aiAnswers.toLocaleString()}</strong><small>{r.actionAnswers.toLocaleString()} free button answers · {r.fallbackAnswers.toLocaleString()} shop-search answers</small></div>
      <div className={`${styles.stat} ${r.unansweredChats ? styles.statWarn : ''}`}><span>Chats with an unanswered question</span><strong>{r.unansweredChats.toLocaleString()}</strong><small>{r.escalated.toLocaleString()} sent to WhatsApp or email</small></div>
      <div className={styles.stat}><span>AI cost (estimate)</span><strong>{usd(r.costTodayUsd)}</strong><small>today · {usd(r.costPeriodUsd)} in 30 days</small></div>
    </div>
    <div className={styles.tables}>
      <section className={styles.panel}>
        <div className={styles.panelHead}><div><h2>Questions it could not answer</h2><p>Add an answer under FAQ answers, or check the product or setting it was about.</p></div></div>
        {r.unanswered.length ? <ul className={styles.list}>{r.unanswered.map(u => <li key={`${u.conversationId}-${u.at}`}><Link href={`/admin/online-store/assistant/${u.conversationId}`}>{u.question}</Link><small>{when(u.at)}</small></li>)}</ul> : <p className={ui.muted}>Nothing yet.</p>}
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHead}><div><h2>What shoppers asked for</h2><p>The searches the assistant ran for shoppers, most asked first.</p></div></div>
        {r.topSearches.length ? <table className={ui.table}><thead><tr><th scope="col">Search</th><th scope="col">Times</th></tr></thead><tbody>{r.topSearches.map(s => <tr key={s.query}><td dir="auto">{s.query}</td><td>{s.count}</td></tr>)}</tbody></table> : <p className={ui.muted}>Nothing yet.</p>}
      </section>
    </div>
  </>
}

async function Chats(filter: ChatFilter, page: number) {
  const list = await listConversations(filter, page)
  const label = { all: 'All', unanswered: 'Unanswered question', escalated: 'Sent to support' }
  const href = (f: ChatFilter, p = 1) => `/admin/online-store/assistant?tab=chats${f === 'all' ? '' : `&filter=${f}`}${p > 1 ? `&page=${p}` : ''}`
  return <section className={styles.panel}>
    <div className={styles.panelHead}>
      <div><h2>Conversations ({list.total.toLocaleString()})</h2><p>Kept 90 days. Emails, phone numbers and card numbers shoppers typed are hidden.</p></div>
      <nav className={styles.periods} aria-label="Filter">{CHAT_FILTERS.map(f => <Link key={f} href={href(f)} aria-current={filter === f ? 'page' : undefined} className={filter === f ? styles.periodOn : undefined}>{label[f]}</Link>)}</nav>
    </div>
    {list.rows.length ? <div className={ui.tableWrap}><table className={ui.table}>
      <thead><tr><th scope="col">Started with</th><th scope="col">Shopper</th><th scope="col">Language</th><th scope="col">Messages</th><th scope="col">Last message</th><th scope="col">AI cost</th></tr></thead>
      <tbody>{list.rows.map(c => <tr key={c.id}>
        <td><Link href={`/admin/online-store/assistant/${c.id}`} className={styles.chatLink} dir="auto">{c.firstMessage || '(no message)'}</Link>{c.unanswered ? <span className={`${ui.statusPill} ${ui.statusPillWarning}`}>Unanswered</span> : null}{c.escalated ? <span className={ui.statusPill}>Support</span> : null}</td>
        <td>{c.customer ? <Link href={`/admin/customers/${c.customer.id}`}>{c.customer.name}</Link> : <span className={ui.muted}>Guest</span>}</td>
        <td>{LANG[c.lang] || c.lang}</td>
        <td>{c.messageCount}</td>
        <td>{when(c.updatedAt)}</td>
        <td>{usd(c.costUsd)}</td>
      </tr>)}</tbody>
    </table></div> : <p className={ui.muted}>No conversations{filter === 'all' ? ' yet' : ' with this filter'}.</p>}
    {list.pages > 1 ? <nav className={styles.pager} aria-label="Pages">
      {page > 1 ? <Link href={href(filter, page - 1)}>Newer</Link> : <span />}
      <span className={ui.muted}>Page {page} of {list.pages}</span>
      {page < list.pages ? <Link href={href(filter, page + 1)}>Older</Link> : <span />}
    </nav> : null}
  </section>
}

async function Faq(canManage: boolean) {
  const [faqs, report] = await Promise.all([
    db.assistantFaq.findMany({ select: { id: true, question: true, questionAr: true, answer: true, answerAr: true, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    assistantReport(new Date(), 30),
  ])
  return <AssistantFaqs initial={faqs} canManage={canManage} suggestions={[...new Set(report.unanswered.map(u => u.question))]} />
}
