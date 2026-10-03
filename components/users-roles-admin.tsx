'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import ui from './admin-ui.module.css'
import s from './admin-users.module.css'
import { useConfirm } from './admin-confirm'
import { BUILT_IN_ROLES, PERMISSION_SECTIONS, builtInRoleName } from '@/lib/permission-groups'
import { ROLE_PERMISSIONS, type Permission } from '@/lib/permissions'

type UserRow = { id: string; name: string; email: string; phone?: string | null; role: string; staffRoleId?: string | null; isActive: boolean; lastLoginAt?: string | null }
type CustomRole = { id: string; name: string; description: string; permissions: Permission[]; users?: number }
type CurrentUser = { id: string; role: string } | null

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

const roleValue = (u: { role: string; staffRoleId?: string | null }) => u.staffRoleId ? `custom:${u.staffRoleId}` : u.role

function PasswordInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [show, setShow] = useState(false)
  return <div className={s.passwordRow}>
    <input className={ui.input} type={show ? 'text' : 'password'} minLength={8} required value={value} onChange={e => onChange(e.target.value)} autoComplete="new-password" autoFocus={autoFocus} placeholder="At least 8 characters" />
    <button type="button" className={ui.iconBtn} onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => { onChange(generatePassword()); setShow(true) }}><RefreshCw size={13} /> Generate</button>
  </div>
}

function RoleSelect({ value, onChange, customRoles, allowSuper, disabled }: { value: string; onChange: (v: string) => void; customRoles: CustomRole[]; allowSuper: boolean; disabled?: boolean }) {
  return <select className={ui.input} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
    <optgroup label="Built-in roles">
      {BUILT_IN_ROLES.filter(r => r.key !== 'SUPER_ADMIN' || allowSuper || value === 'SUPER_ADMIN').map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
    </optgroup>
    {customRoles.length > 0 && <optgroup label="Your roles">{customRoles.map(r => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}</optgroup>}
  </select>
}

function Modal({ title, eyebrow, onClose, children, wide }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className={ui.modalOverlay} onMouseDown={onClose}>
    <div className={`${ui.modal} ${s.modal} ${wide ? s.modalWide : ''}`} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
      <div className={ui.modalHead}><div>{eyebrow && <span className={`${ui.muted} ${ui.tiny}`}>{eyebrow}</span>}<h2>{title}</h2></div><button type="button" className={ui.iconBtn} onClick={onClose} aria-label="Close"><X size={16} /></button></div>
      <div className={s.modalBody}>{children}</div>
    </div>
  </div>
}

export default function UsersRolesAdmin({ initialUsers, initialRoles, currentUser, canManage }: { initialUsers: UserRow[]; initialRoles: CustomRole[]; currentUser: CurrentUser; canManage: boolean }) {
  const confirm = useConfirm()
  const [tab, setTab] = useState<'staff' | 'roles'>('staff')
  const [users, setUsers] = useState(initialUsers)
  const [roles, setRoles] = useState(initialRoles)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [staffForm, setStaffForm] = useState<null | { id?: string; name: string; email: string; phone: string; role: string; password: string }>(null)
  const [passwordFor, setPasswordFor] = useState<null | { user: UserRow; password: string }>(null)
  const [roleForm, setRoleForm] = useState<null | { id?: string; name: string; description: string; permissions: Permission[] }>(null)
  const isSuper = currentUser?.role === 'SUPER_ADMIN'

  const roleName = (u: UserRow) => u.staffRoleId ? (roles.find(r => r.id === u.staffRoleId)?.name || 'Deleted role') : builtInRoleName(u.role)
  const done = (message: string) => { setNotice(message); setError('') }
  const fail = (e: unknown) => { setError(e instanceof Error ? e.message : 'Something went wrong'); setNotice('') }

  async function refresh() {
    const [u, r] = await Promise.all([api('/api/admin/users'), api('/api/admin/roles')])
    setUsers(Array.isArray(u) ? u : []); setRoles(r.roles || [])
  }

  // The phone's Back button (and Next.js' page cache) can bring this screen back exactly as it
  // was, without the roles or staff changed since. Reload both lists when the screen opens and
  // whenever it comes back into view, so it always matches what is saved.
  useEffect(() => {
    const sync = () => { if (document.visibilityState === 'visible') refresh().catch(() => {}) }
    sync()
    window.addEventListener('pageshow', sync)
    document.addEventListener('visibilitychange', sync)
    return () => { window.removeEventListener('pageshow', sync); document.removeEventListener('visibilitychange', sync) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveStaff(e: React.FormEvent) {
    e.preventDefault(); if (!staffForm) return
    setBusy(true)
    try {
      const data = staffForm.id
        ? await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: staffForm.id, name: staffForm.name, email: staffForm.email, phone: staffForm.phone, role: staffForm.role }) })
        : await api('/api/admin/users', { method: 'POST', body: JSON.stringify(staffForm) })
      if (data.user) setUsers(list => [data.user, ...list.filter(u => u.id !== data.user.id)])
      setStaffForm(null)
      done(staffForm.id ? `${staffForm.name} updated.` : `${staffForm.name} can now sign in at /admin-login with the password you set.`)
      refresh().catch(() => {})
    } catch (err) {
      if (err instanceof Error && /already/.test(err.message)) refresh().catch(() => {})
      fail(err)
    } finally { setBusy(false) }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault(); if (!passwordFor) return
    setBusy(true)
    try {
      await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: passwordFor.user.id, password: passwordFor.password }) })
      done(`New password set for ${passwordFor.user.name}. They were signed out and must use it next time.`); setPasswordFor(null)
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  async function setActive(user: UserRow, isActive: boolean) {
    if (!isActive && !(await confirm({ title: `Disable ${user.name}?`, message: 'They are signed out straight away and cannot sign in until you enable them again. Nothing is deleted.', confirmLabel: 'Disable' }))) return
    try { await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: user.id, isActive }) }); setUsers(list => list.map(u => u.id === user.id ? { ...u, isActive } : u)); done(isActive ? `${user.name} can sign in again.` : `${user.name} is disabled.`); refresh().catch(() => {}) } catch (err) { fail(err) }
  }

  async function removeUser(user: UserRow) {
    if (!(await confirm({ title: `Delete ${user.name}?`, message: 'Their account is removed for good. Orders and notes they handled are kept. To only block access for a while, use Disable instead.', confirmLabel: 'Delete for good' }))) return
    try { await api(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' }); setUsers(list => list.filter(u => u.id !== user.id)); done(`${user.name} was deleted.`); refresh().catch(() => {}) } catch (err) { fail(err); refresh().catch(() => {}) }
  }

  async function saveRole(e: React.FormEvent) {
    e.preventDefault(); if (!roleForm) return
    setBusy(true)
    try {
      const data = await api('/api/admin/roles', { method: roleForm.id ? 'PATCH' : 'POST', body: JSON.stringify(roleForm) })
      // Saved: show it straight away, then reload the lists (a failed reload is not a failed save).
      if (data.role) setRoles(list => [...list.filter(r => r.id !== data.role.id), { users: 0, ...list.find(r => r.id === data.role.id), ...data.role }])
      setRoleForm(null); done(`Role "${roleForm.name}" saved.`)
      refresh().catch(() => {})
    } catch (err) {
      // Usually an earlier save that did go through; show the list as it really is.
      if (err instanceof Error && /already exists/.test(err.message)) {
        await refresh().catch(() => {})
        setRoleForm(null)
        setError(`A role called "${roleForm.name}" already exists. It is in the list below: use Edit to change it.`); setNotice('')
      } else fail(err)
    } finally { setBusy(false) }
  }

  async function removeRole(role: CustomRole) {
    if (!(await confirm({ title: `Delete the role "${role.name}"?`, message: 'Staff members must be moved to another role first.', confirmLabel: 'Delete role' }))) return
    try { await api(`/api/admin/roles?id=${encodeURIComponent(role.id)}`, { method: 'DELETE' }); setRoles(list => list.filter(r => r.id !== role.id)); done(`Role "${role.name}" deleted.`); refresh().catch(() => {}) } catch (err) { fail(err); refresh().catch(() => {}) }
  }

  const active = users.filter(u => u.isActive).length

  return <div className={s.page}>
    <div className={s.head}>
      <div><span className={`${ui.muted} ${ui.tiny}`}>ACCESS CONTROL</span><h1 className={ui.title}>Users &amp; roles</h1>
        <p className={ui.muted}>{canManage ? 'Add staff, choose what each person can see and change, and reset their passwords.' : 'You can see who has access. Only the owner can change staff or roles.'}</p></div>
      {canManage && <div className={s.headActions}>
        {tab === 'staff' ? <button className={ui.btn} onClick={() => setStaffForm({ name: '', email: '', phone: '', role: roles[0] ? `custom:${roles[0].id}` : 'SUPPORT', password: generatePassword() })}><UserPlus size={15} /> Add staff</button>
          : <button className={ui.btn} onClick={() => setRoleForm({ name: '', description: '', permissions: ['dashboard.view'] })}><Plus size={15} /> Create role</button>}
      </div>}
    </div>

    <div className={s.tabs} role="tablist">
      <button role="tab" aria-selected={tab === 'staff'} className={tab === 'staff' ? s.tabOn : ''} onClick={() => setTab('staff')}>Staff <span>{users.length}</span></button>
      <button role="tab" aria-selected={tab === 'roles'} className={tab === 'roles' ? s.tabOn : ''} onClick={() => setTab('roles')}>Roles <span>{BUILT_IN_ROLES.length + roles.length}</span></button>
    </div>

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`} role="status">{error || notice}</div>}

    {tab === 'staff' && <div className={`${ui.card} ${s.listCard}`}>
      <div className={s.listMeta}>{users.length} staff · {active} active</div>
      {users.map(u => {
        const self = u.id === currentUser?.id
        const lockedSuper = u.role === 'SUPER_ADMIN' && !isSuper
        const can = canManage && !lockedSuper
        return <div key={u.id} className={`${s.userRow} ${u.isActive ? '' : s.userOff}`}>
          <div className={s.avatar} aria-hidden="true">{(u.name || u.email).slice(0, 1).toUpperCase()}</div>
          <div className={s.userMain}>
            <strong>{u.name}{self && <em> · You</em>}</strong>
            <span>{u.email}{u.phone ? ` · ${u.phone}` : ''}</span>
          </div>
          <div className={s.userRole}><span className={`${ui.statusPill} ${u.role === 'SUPER_ADMIN' ? s.ownerPill : ''}`}>{u.role === 'SUPER_ADMIN' && <ShieldCheck size={12} />}{roleName(u)}</span></div>
          <div className={s.userStatus}>
            <span className={`${ui.statusPill} ${u.isActive ? ui.statusPillSuccess : ui.statusPillDanger}`}>{u.isActive ? 'Active' : 'Disabled'}</span>
            <small>{u.lastLoginAt ? `Last sign-in ${new Date(u.lastLoginAt).toLocaleDateString()}` : 'Never signed in'}</small>
          </div>
          {can && <div className={s.userActions}>
            <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => setStaffForm({ id: u.id, name: u.name, email: u.email, phone: u.phone || '', role: roleValue(u), password: '' })}><Pencil size={13} /> Edit</button>
            <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => setPasswordFor({ user: u, password: generatePassword() })}><KeyRound size={13} /> Password</button>
            {!self && <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => setActive(u, !u.isActive)}>{u.isActive ? 'Disable' : 'Enable'}</button>}
            {!self && <button className={`${ui.iconBtn} ${ui.iconBtnDanger}`} onClick={() => removeUser(u)} aria-label={`Delete ${u.name}`}><Trash2 size={15} /></button>}
          </div>}
        </div>
      })}
    </div>}

    {tab === 'roles' && <div className={s.roleGrid}>
      {roles.map(r => <div key={r.id} className={`${ui.card} ${s.roleCard}`}>
        <div className={s.roleTop}><strong>{r.name}</strong><span className={ui.statusPill}>Custom</span></div>
        <p className={ui.muted}>{r.description || 'No description'}</p>
        <div className={s.roleFacts}><span>{r.permissions.length} permissions</span><span>{r.users || 0} staff</span></div>
        {canManage && <div className={s.roleActions}>
          <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => setRoleForm({ id: r.id, name: r.name, description: r.description, permissions: r.permissions })}><Pencil size={13} /> Edit</button>
          <button className={`${ui.iconBtn} ${ui.iconBtnDanger}`} onClick={() => removeRole(r)} aria-label={`Delete ${r.name}`}><Trash2 size={15} /></button>
        </div>}
      </div>)}
      {canManage && <button className={`${ui.card} ${s.roleNew}`} onClick={() => setRoleForm({ name: '', description: '', permissions: ['dashboard.view'] })}><Plus size={20} /><strong>Create a role</strong><span>For a new position, e.g. “Delivery coordinator”: pick exactly what they can see and change.</span></button>}
      {BUILT_IN_ROLES.map(r => <div key={r.key} className={`${ui.card} ${s.roleCard} ${s.roleBuiltIn}`}>
        <div className={s.roleTop}><strong>{r.name}</strong><span className={ui.statusPill}>Built-in</span></div>
        <p className={ui.muted}>{r.description}</p>
        <div className={s.roleFacts}><span>{ROLE_PERMISSIONS[r.key].length} permissions</span><span>{users.filter(u => !u.staffRoleId && u.role === r.key).length} staff</span></div>
        {canManage && r.key !== 'SUPER_ADMIN' && <div className={s.roleActions}><button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => setRoleForm({ name: `${r.name} (custom)`, description: r.description, permissions: ROLE_PERMISSIONS[r.key].filter(p => p !== 'users.manage') })}>Copy as new role</button></div>}
      </div>)}
    </div>}

    {staffForm && <Modal title={staffForm.id ? `Edit ${staffForm.name || 'staff member'}` : 'Add a staff member'} eyebrow="STAFF" onClose={() => !busy && setStaffForm(null)}>
      <form onSubmit={saveStaff} className={s.form}>
        <div className={ui.twoCol}>
          <label className={ui.fieldLabel}>Full name<input className={ui.input} required value={staffForm.name} onChange={e => setStaffForm({ ...staffForm, name: e.target.value })} autoFocus /></label>
          <label className={ui.fieldLabel}>Phone (optional)<input className={ui.input} value={staffForm.phone} onChange={e => setStaffForm({ ...staffForm, phone: e.target.value })} /></label>
        </div>
        <label className={ui.fieldLabel}>Email (used to sign in)<input className={ui.input} required type="email" value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} /></label>
        <label className={ui.fieldLabel}>Role
          <RoleSelect value={staffForm.role} onChange={role => setStaffForm({ ...staffForm, role })} customRoles={roles} allowSuper={isSuper} disabled={staffForm.id === currentUser?.id} />
          <span className={ui.fieldHelp}>{staffForm.id === currentUser?.id ? 'You cannot change your own role.' : 'Need something else? Create a role in the Roles tab.'}</span>
        </label>
        {!staffForm.id && <label className={ui.fieldLabel}>Password<PasswordInput value={staffForm.password} onChange={password => setStaffForm({ ...staffForm, password })} /><span className={ui.fieldHelp}>Give it to them privately. They can change it later from their account.</span></label>}
        <div className={s.formActions}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setStaffForm(null)} disabled={busy}>Cancel</button><button className={ui.btn} disabled={busy}>{busy ? 'Saving…' : staffForm.id ? 'Save changes' : 'Add staff member'}</button></div>
      </form>
    </Modal>}

    {passwordFor && <Modal title={`New password for ${passwordFor.user.name}`} eyebrow="PASSWORD" onClose={() => !busy && setPasswordFor(null)}>
      <form onSubmit={savePassword} className={s.form}>
        <PasswordInput value={passwordFor.password} onChange={password => setPasswordFor({ ...passwordFor, password })} autoFocus />
        <p className={ui.muted} style={{ margin: 0 }}>They are signed out on every device and must use this password next time. Copy it before saving.</p>
        <div className={s.formActions}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setPasswordFor(null)} disabled={busy}>Cancel</button><button className={ui.btn} disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button></div>
      </form>
    </Modal>}

    {roleForm && <RoleModal form={roleForm} setForm={setRoleForm} busy={busy} onSubmit={saveRole} onClose={() => !busy && setRoleForm(null)} />}
  </div>
}

function RoleModal({ form, setForm, busy, onSubmit, onClose }: { form: { id?: string; name: string; description: string; permissions: Permission[] }; setForm: (f: any) => void; busy: boolean; onSubmit: (e: React.FormEvent) => void; onClose: () => void }) {
  const has = (p?: Permission) => !!p && form.permissions.includes(p)
  const set = (list: Permission[], on: boolean) => {
    const next = new Set(form.permissions)
    for (const p of list) on ? next.add(p) : next.delete(p)
    setForm({ ...form, permissions: Array.from(next) })
  }
  const total = useMemo(() => PERMISSION_SECTIONS.flatMap(sec => sec.areas.flatMap(a => [a.view, a.manage, ...(a.extra || []).map(x => x.permission)].filter(Boolean))).length, [])
  return <Modal title={form.id ? `Edit role: ${form.name}` : 'Create a role'} eyebrow="ROLE" onClose={onClose} wide>
    <form onSubmit={onSubmit} className={s.form}>
      <div className={ui.twoCol}>
        <label className={ui.fieldLabel}>Role name<input className={ui.input} required maxLength={60} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Delivery coordinator" autoFocus /></label>
        <label className={ui.fieldLabel}>Description (optional)<input className={ui.input} maxLength={200} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What this person does" /></label>
      </div>
      <div className={s.permHead}><strong>What can this role do?</strong><span className={ui.muted}>{form.permissions.length} of {total} selected · “Change” includes “See”</span></div>
      <div className={s.permSections}>
        {PERMISSION_SECTIONS.map(sec => <div key={sec.title} className={s.permSection}>
          <div className={s.permSectionHead}><strong>{sec.title}</strong>
            <button type="button" className={ui.textButton} onClick={() => { const all = sec.areas.flatMap(a => [a.view, a.manage, ...(a.extra || []).map(x => x.permission)].filter(Boolean) as Permission[]); set(all, !all.every(p => has(p))) }}>{sec.areas.every(a => (!a.view || has(a.view)) && (!a.manage || has(a.manage))) ? 'Clear all' : 'Allow all'}</button>
          </div>
          {sec.areas.map(a => <div key={a.key} className={s.permRow}>
            <div className={s.permLabel}><span>{a.label}</span>{a.hint && <small>{a.hint}</small>}</div>
            <div className={s.permChecks}>
              {a.view && <label><input type="checkbox" checked={has(a.view)} onChange={e => set(e.target.checked ? [a.view!] : [a.view!, ...(a.manage ? [a.manage] : []), ...(a.extra || []).map(x => x.permission)], e.target.checked)} /> See</label>}
              {a.manage && <label><input type="checkbox" checked={has(a.manage)} onChange={e => set(e.target.checked ? [a.manage!, ...(a.view ? [a.view] : [])] : [a.manage!], e.target.checked)} /> Change</label>}
              {(a.extra || []).map(x => <label key={x.permission}><input type="checkbox" checked={has(x.permission)} onChange={e => set(e.target.checked ? [x.permission, ...(a.view ? [a.view] : [])] : [x.permission], e.target.checked)} /> {x.label}</label>)}
            </div>
          </div>)}
        </div>)}
      </div>
      <div className={s.formActions}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={busy}>Cancel</button><button className={ui.btn} disabled={busy}>{busy ? 'Saving…' : form.id ? 'Save role' : 'Create role'}</button></div>
    </form>
  </Modal>
}
