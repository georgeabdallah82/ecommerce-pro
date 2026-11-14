import Link from '@/components/admin-link'
import { requirePermission } from '@/lib/auth'
import { hasPermission, type Permission } from '@/lib/permissions'
import { getThemeEditorState } from '@/lib/theme'
import { db } from '@/lib/prisma'
import { siteUrl } from '@/lib/seo'
import { EDITOR, fontLabel, menuLinkCount, plural, setupItems, setupProgress, timeAgo, visibleHomeSections, type OverviewFacts } from '@/lib/online-store-overview'
import { ArrowRight, CheckCircle2, Circle, Database, ExternalLink, FileText, Image as ImageIcon, Menu, Newspaper, Palette, Pencil, Route, ScrollText, Settings2, UploadCloud } from 'lucide-react'
import ui from '@/components/admin-ui.module.css'
import s from '@/components/online-store-overview.module.css'

export const dynamic = 'force-dynamic'

const DETAIL_KEYS = { email: 'contact.email', phone: 'contact.phone', address: 'store.address', returnDays: 'policy.returnDays', refundTime: 'policy.refundTime', damageReportHours: 'policy.damageReportHours' } as const

// The colours a visitor notices most, with what each one paints.
const SWATCHES: Array<[string, string]> = [['primary', 'Buttons and links'], ['accent', 'Accent'], ['text', 'Text'], ['background', 'Page background'], ['announcementBg', 'Announcement bar']]

// Admin › Online store › Overview: how the store looks and whether it is live, what is left to set up, and the pages
// that manage the storefront, from the store's own data (lib/online-store-overview.ts).
export default async function OnlineStore() {
  const user = await requirePermission('content.view')
  const can = (permission: Permission) => hasPermission(user, permission)
  const [state, draftRow, liveRow, lastVersion, pages, pagesLive, posts, postsLive, redirects, media, metafields, rows] = await Promise.all([
    getThemeEditorState(),
    db.setting.findUnique({ where: { key: 'theme.draft' }, select: { updatedAt: true } }),
    db.setting.findUnique({ where: { key: 'theme.config' }, select: { updatedAt: true } }),
    db.themeVersion.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, createdBy: true } }),
    db.page.count(),
    db.page.count({ where: { status: 'PUBLISHED' } }),
    db.blogPost.count(),
    db.blogPost.count({ where: { status: 'PUBLISHED' } }),
    db.redirect.count(),
    can('media.view') ? db.mediaAsset.count() : Promise.resolve(null),
    can('metafields.view') ? db.metafieldDefinition.count() : Promise.resolve(null),
    db.setting.findMany({ where: { key: { in: [...Object.values(DETAIL_KEYS), 'maintenance.enabled'] } }, select: { key: true, value: true } }),
  ])
  // When the live theme was last written (a publish writes it), and by whom when a saved version matches that time
  // (a store published before version history was kept has none).
  const liveAt = liveRow?.updatedAt || null
  const matchingVersion = lastVersion && liveAt && Math.abs(lastVersion.createdAt.getTime() - liveAt.getTime()) < 2 * 60 * 1000 ? lastVersion : null
  const publisher = matchingVersion?.createdBy ? await db.user.findUnique({ where: { id: matchingVersion.createdBy }, select: { name: true, email: true } }) : null
  const value = (key: string) => String(rows.find(row => row.key === key)?.value || '').trim()
  const theme: Record<string, any> = state.theme || {}
  const facts: OverviewFacts = {
    theme,
    templates: state.editorTemplates || {},
    navigation: Array.isArray(state.navigation) ? state.navigation : [],
    hasDraft: state.draft,
    draftSavedAt: draftRow?.updatedAt ? draftRow.updatedAt.toISOString() : null,
    lastPublish: liveAt ? { at: liveAt.toISOString(), by: publisher?.name || publisher?.email || null } : null,
    details: Object.fromEntries(Object.entries(DETAIL_KEYS).map(([name, key]) => [name, value(key) !== ''])) as OverviewFacts['details'],
    maintenanceOn: value('maintenance.enabled') === 'true',
  }
  const items = setupItems(facts)
  const progress = setupProgress(items)
  const sections = visibleHomeSections(facts.templates)
  const links = menuLinkCount(facts.navigation)
  const detailsFilled = Object.values(facts.details).filter(Boolean).length
  const host = siteUrl().replace(/^https?:\/\//, '')
  const brand = String(theme.brandName || 'Your store')
  const logo = String(theme.logoUrl || '')

  const tiles = [
    { href: EDITOR, icon: Palette, title: 'Theme editor', count: plural(sections, 'homepage section'), text: 'Colours, fonts, sections and page designs.', show: true },
    { href: '/admin/online-store/navigation', icon: Menu, title: 'Navigation', count: `${plural(links, 'link')} in the main menu`, text: 'The header menu, its dropdowns and the order of links.', show: true },
    { href: '/admin/online-store/pages', icon: FileText, title: 'Pages', count: pages ? `${plural(pages, 'page')} · ${pagesLive} visible` : 'None yet', text: 'Standalone pages such as About us or FAQ.', show: true },
    { href: '/admin/online-store/blog', icon: Newspaper, title: 'Blog', count: posts ? `${plural(posts, 'post')} · ${postsLive} published` : 'No posts yet', text: `Posts appear at ${host}/blog.`, show: true },
    { href: '/admin/online-store/policies', icon: ScrollText, title: 'Policies', count: `${detailsFilled} of 6 store details filled in`, text: 'Privacy, terms, refunds and shipping, written for you.', show: true },
    { href: '/admin/online-store/redirects', icon: Route, title: 'URL redirects', count: redirects ? plural(redirects, 'redirect') : 'None yet', text: 'Send visitors from an old address to a new one.', show: true },
    { href: '/admin/media', icon: ImageIcon, title: 'Files', count: media === null ? '' : plural(media, 'file'), text: 'Images and files to reuse across the store.', show: can('media.view') },
    { href: '/admin/metafields', icon: Database, title: 'Custom data', count: metafields === null ? '' : plural(metafields, 'field definition'), text: 'Extra fields for your products.', show: can('metafields.view') },
    { href: '/admin/settings', icon: Settings2, title: 'Store settings', count: '', text: 'Brand, contact details, checkout and search engines.', show: can('settings.view') },
  ].filter(tile => tile.show)

  return (
    <div className={s.page}>
      <div className={ui.sectionHead}>
        <div>
          <span className={ui.muted}>ONLINE STORE</span>
          <h1 className={ui.title}>Online store</h1>
          <p className={ui.muted}>How your store looks, what is left to set up, and where to change it.</p>
        </div>
        <div className={s.headActions}>
          <a className={`${ui.btn} ${ui.btnSecondary}`} href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> View store<span className={s.srOnly}> ({host}, opens in a new tab)</span></a>
          <Link className={ui.btn} href={EDITOR}><Palette size={16} aria-hidden="true" /> Open theme editor</Link>
        </div>
      </div>

      <section className={`${ui.card} ${s.theme}`} aria-labelledby="online-store-theme">
        <div className={s.themeStatus}>
          <div className={s.themeHead}>
            <h2 id="online-store-theme" className={s.h2}>Your theme</h2>
            {facts.hasDraft
              ? <span className={`${ui.statusPill} ${ui.statusPillWarning}`}>Unpublished changes</span>
              : <span className={`${ui.statusPill} ${ui.statusPillSuccess}`}>Live</span>}
          </div>
          {facts.hasDraft
            ? <p className={s.lead}>Changes saved {facts.draftSavedAt ? <time dateTime={facts.draftSavedAt} title={new Date(facts.draftSavedAt).toLocaleString('en-GB')}>{timeAgo(facts.draftSavedAt)}</time> : 'earlier'} are waiting to be published. Visitors still see the last published version.</p>
            : <p className={s.lead}>Everything in the theme editor is what visitors see now.</p>}
          <p className={ui.muted}>{facts.lastPublish
            ? <>The live theme was last updated <time dateTime={facts.lastPublish.at} title={new Date(facts.lastPublish.at).toLocaleString('en-GB')}>{timeAgo(facts.lastPublish.at)}</time>{facts.lastPublish.by ? ` by ${facts.lastPublish.by}` : ''}.</>
            : 'Not published yet: visitors see the standard design until you publish.'}</p>
          <div className={s.actions}>
            {facts.hasDraft && <Link className={ui.btn} href={`${EDITOR}?review=1`}><UploadCloud size={16} aria-hidden="true" /> Review and publish</Link>}
            <Link className={`${ui.btn} ${facts.hasDraft ? ui.btnSecondary : ''}`} href={EDITOR}><Pencil size={16} aria-hidden="true" /> {facts.hasDraft ? 'Continue editing' : 'Customize'}</Link>
          </div>
        </div>
        <div className={s.themeLook} aria-label="Theme at a glance" role="group">
          <div className={s.brand}>
            {logo ? <img src={logo} alt="" className={s.logo} /> : null}
            <strong>{brand}</strong>
          </div>
          <dl className={s.facts}>
            <div><dt>Colours</dt><dd className={s.swatches}>
              {SWATCHES.filter(([key]) => /^#[0-9a-f]{3,8}$/i.test(String(theme.colors?.[key] || ''))).map(([key, label]) => (
                <span key={key} className={s.swatch} title={`${label}: ${theme.colors[key]}`}>
                  <span className={s.chip} style={{ background: theme.colors[key] }} aria-hidden="true" />
                  <span className={s.srOnly}>{label}: {theme.colors[key]}</span>
                </span>
              ))}
            </dd></div>
            <div><dt>Fonts</dt><dd>{fontLabel(theme.typography?.heading)} for headings, {fontLabel(theme.typography?.body)} for text</dd></div>
            <div><dt>Homepage</dt><dd>{plural(sections, 'section')}</dd></div>
            <div><dt>Languages</dt><dd>{theme.languages?.arabic === true ? 'English and Arabic' : 'English'}</dd></div>
            <div><dt>WhatsApp button</dt><dd>{theme.whatsapp?.enabled === true ? 'On' : 'Off'}</dd></div>
          </dl>
        </div>
      </section>

      <section className={`${ui.card} ${s.setup}`} aria-labelledby="online-store-setup">
        <div className={s.setupHead}>
          <h2 id="online-store-setup" className={s.h2}>Setup</h2>
          <span className={s.progressText}>{progress.done} of {progress.total} done</span>
        </div>
        <div className={s.bar} role="progressbar" aria-label="Setup" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><span style={{ width: `${progress.total ? Math.round(100 * progress.done / progress.total) : 0}%` }} /></div>
        <ul className={s.items}>
          {items.map(item => (
            <li key={item.id} className={item.status === 'ok' ? s.ok : item.optional ? s.optional : s.todo}>
              {item.status === 'ok' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
              <div>
                <strong>{item.title}<span className={s.srOnly}>{item.status === 'ok' ? ': done' : item.optional ? ': optional' : ': to do'}</span></strong>
                <span>{item.detail}</span>
              </div>
              <Link className={s.fix} href={item.href}>{item.fix}<ArrowRight size={14} aria-hidden="true" /></Link>
            </li>
          ))}
        </ul>
        {can('settings.manage') && <p className={s.more}><Link href="/admin/launch">The full launch checklist</Link> covers payments, delivery, products and the rest of the store.</p>}
      </section>

      <section aria-labelledby="online-store-manage">
        <h2 id="online-store-manage" className={`${s.h2} ${s.manageTitle}`}>Manage your online store</h2>
        <ul className={s.tiles}>
          {tiles.map(tile => (
            <li key={tile.href}>
              <Link className={s.tile} href={tile.href}>
                <tile.icon size={20} aria-hidden="true" />
                <span className={s.tileText}>
                  <strong>{tile.title}</strong>
                  {tile.count && <span className={s.tileCount}>{tile.count}</span>}
                  <span className={s.tileNote}>{tile.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
