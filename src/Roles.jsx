import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { createStore, toast } from './lib/store'
import { ask } from './Dialog'
import { PERMS, canKick, canModerate, canSetRole, hasPerm, sortRoles, topColor, userRoles } from './lib/roles'
import './styles/roles.css'
import Icon from './icons/Icon'

// ── per-server roles cache: serverId -> { roles (highest first), byUser: { userId: [roleId] } } ──
const roleStore = createStore({})
const EMPTY = { roles: [], byUser: {} }
const watchers = {}

export async function reloadRoles(sid) {
  const [r, mr] = await Promise.all([
    supabase.from('roles').select('*').eq('server_id', sid),
    supabase.from('member_roles').select('user_id, role_id').eq('server_id', sid),
  ])
  if (!r.data || !mr.data) return
  const byUser = {}
  for (const x of mr.data) (byUser[x.user_id] ||= []).push(x.role_id)
  roleStore.set(s => ({ ...s, [sid]: { roles: sortRoles(r.data), byUser } }))
}

// One shared subscription per server, refcounted across every component that asks.
function watch(sid) {
  const w = (watchers[sid] ||= { n: 0 })
  if (w.n++ === 0) {
    const load = () => reloadRoles(sid)
    load()
    // DELETE events can't be filtered server-side, so check them here.
    w.ch = supabase.channel('roles:' + sid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles', filter: `server_id=eq.${sid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_roles', filter: `server_id=eq.${sid}` }, load)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'roles' },
        ({ old }) => roleStore.get()[sid]?.roles.some(r => r.id === old.id) && load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'member_roles' }, ({ old }) => old.server_id === sid && load())
      .subscribe()
  }
  return () => { if (--w.n === 0) { supabase.removeChannel(w.ch); delete watchers[sid] } }
}

export function useMemberRoles(serverId) {
  useEffect(() => serverId ? watch(serverId) : undefined, [serverId])
  return roleStore.use(s => s[serverId]) || EMPTY
}
// Colour of the member's highest coloured role in that server, or undefined (fall back to profile colour).
export const memberColor = (serverId, userId) => topColor(roleStore.get()[serverId], userId)
export const useMemberColor = (serverId, userId) => roleStore.use(s => serverId ? topColor(s[serverId], userId) : undefined)
// Can the signed-in user kick this member? Mirrors the "leave or kick" policy.
export function useCanKick(ctx, uid, targetRole) {
  const data = useMemberRoles(ctx.server?.id)
  return !!ctx.server && canKick(data, ctx.role, ctx.userId, uid, targetRole)
}
// Same check for non-hook callers (right-click menus).
export const canKickNow = (ctx, uid, targetRole) =>
  !!ctx.server && canKick(roleStore.get()[ctx.server.id] || EMPTY, ctx.role, ctx.userId, uid, targetRole)
// Ban / time out / rename: same rank rule as public.can_moderate().
export const canModerateNow = (ctx, uid, targetRole, perm) =>
  !!ctx?.server && canModerate(roleStore.get()[ctx.server.id] || EMPTY, ctx.role, ctx.userId, uid, targetRole, perm)

const SWATCHES = ['#ff9f6b', '#e76f51', '#ff6b8b', '#c77dff', '#7b9cff', '#4cc9f0', '#7ed6b1', '#b5e48c', '#ffd166']
const err = ({ error }) => error && toast(error.message)

// ── Server settings → Roles ──
export function RolesTab({ ctx }) {
  const sid = ctx.server.id
  const data = useMemberRoles(sid)
  const [open, setOpen] = useState(null)
  const canManage = hasPerm(data, ctx.role, ctx.userId, 'manage_roles')
  const editable = r => canSetRole(data, ctx.role, ctx.userId, r)

  async function create() {
    const position = data.roles.length ? data.roles.at(-1).position - 1 : 0
    const { data: r, error } = await supabase.from('roles').insert({ server_id: sid, name: 'new role', position }).select().single()
    if (error) return toast(error.message)
    await reloadRoles(sid)
    setOpen(r.id)
  }
  async function move(i, dir) {
    const a = data.roles[i], b = data.roles[i + dir]
    if (!b) return
    // swap positions; nudge if they were tied so the order actually changes
    const pa = a.position === b.position ? b.position - dir : b.position
    err(await supabase.from('roles').update({ position: pa }).eq('id', a.id))
    err(await supabase.from('roles').update({ position: a.position }).eq('id', b.id))
    reloadRoles(sid)
  }

  return (
    <div className="col roles-tab">
      <p className="muted small">Higher roles outrank lower ones. Names show in the colour of someone's highest coloured role.</p>
      {canManage && <button className="btn primary" onClick={create}><Icon name="plus" size={16} /> New role</button>}
      {data.roles.length === 0 && <p className="muted small">No roles yet.</p>}
      <ul className="role-list">
        {data.roles.map((r, i) => (
          <li key={r.id} className={`role-row${open === r.id ? ' open' : ''}`}>
            <div className="row">
              <button className="role-head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <i className="role-dot" style={{ background: r.color || 'var(--muted)' }} />
                <b>{r.name}</b>
                {r.hoist && <span className="muted small">shown separately</span>}
              </button>
              {editable(r) && <>
                <button className="icon-btn" disabled={i === 0 || !editable(data.roles[i - 1])} onClick={() => move(i, -1)} aria-label={`Move ${r.name} up`}><Icon name="chevron-up" size={16} /></button>
                <button className="icon-btn" disabled={i === data.roles.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${r.name} down`}><Icon name="chevron-down" size={16} /></button>
              </>}
            </div>
            {open === r.id && <RoleEditor role={r} sid={sid} locked={!editable(r)} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RoleEditor({ role, sid, locked }) {
  const [name, setName] = useState(role.name)
  const save = async patch => { err(await supabase.from('roles').update(patch).eq('id', role.id)); reloadRoles(sid) }
  async function destroy() {
    if (!await ask({ text: `Delete the ${role.name} role? Everyone loses it.`, confirm: 'Delete', danger: true })) return
    err(await supabase.from('roles').delete().eq('id', role.id))
    reloadRoles(sid)
  }
  return (
    <fieldset className="col role-editor pop" disabled={locked}>
      {locked && <p className="muted small">This role is at or above your own, so you can't change it.</p>}
      <label>Name<input value={name} maxLength={32} onChange={e => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== role.name && save({ name: name.trim() })} /></label>
      <div>
        <span className="muted small"><b>Colour</b></span>
        <div className="swatches">
          <button type="button" className={`swatch none${!role.color ? ' on' : ''}`} onClick={() => save({ color: null })} aria-label="No colour">∅</button>
          {SWATCHES.map(c => <button type="button" key={c} className={`swatch${role.color === c ? ' on' : ''}`} style={{ background: c }}
            onClick={() => save({ color: c })} aria-label={c} />)}
          <input type="color" value={role.color || '#ffffff'} onChange={e => save({ color: e.target.value })} aria-label="Custom colour" />
        </div>
      </div>
      <label className="toggle"><input type="checkbox" checked={role.hoist} onChange={e => save({ hoist: e.target.checked })} />
        <span>Show members with this role separately in the member list</span></label>
      <div className="col perm-list">
        {PERMS.map(([key, label, desc]) => (
          <label key={key} className="toggle perm">
            <input type="checkbox" checked={role.permissions.includes(key)}
              onChange={e => save({ permissions: e.target.checked ? [...role.permissions, key] : role.permissions.filter(p => p !== key) })} />
            <span><b>{label}</b><span className="muted small">{desc}</span></span>
          </label>
        ))}
      </div>
      <button type="button" className="btn danger small" onClick={destroy}>Delete role</button>
    </fieldset>
  )
}

// ── Profile popover: the member's roles as chips, with + / × for people who may hand them out ──
export function RoleChips({ ctx, uid }) {
  const sid = ctx.server?.id
  const data = useMemberRoles(sid)
  const [adding, setAdding] = useState(false)
  if (!sid) return null
  const mine = userRoles(data, uid)
  const canAssign = r => hasPerm(data, ctx.role, ctx.userId, 'manage_roles') && canSetRole(data, ctx.role, ctx.userId, r)
  const addable = data.roles.filter(r => !mine.includes(r) && canAssign(r))
  if (!mine.length && !addable.length) return null

  async function assign(r) {
    setAdding(false)
    err(await supabase.from('member_roles').insert({ server_id: sid, user_id: uid, role_id: r.id }))
    reloadRoles(sid)
  }
  async function unassign(r) {
    err(await supabase.from('member_roles').delete().eq('server_id', sid).eq('user_id', uid).eq('role_id', r.id))
    reloadRoles(sid)
  }
  return (
    <div className="role-chips">
      {mine.map(r => (
        <span key={r.id} className="role-chip pop" style={{ '--rc': r.color || 'var(--muted)' }}>
          <i className="role-dot" />{r.name}
          {canAssign(r) && <button onClick={() => unassign(r)} aria-label={`Remove ${r.name} role`}><Icon name="close" size={12} /></button>}
        </span>
      ))}
      {addable.length > 0 && (
        <span className="role-add">
          <button className="role-chip add" onClick={() => setAdding(!adding)} aria-label="Add role" aria-expanded={adding}><Icon name="plus" size={13} /></button>
          {adding && (
            <div className="menu pop role-menu">
              {addable.map(r => <button key={r.id} onClick={() => assign(r)}><i className="role-dot" style={{ background: r.color || 'var(--muted)' }} /> {r.name}</button>)}
            </div>
          )}
        </span>
      )}
    </div>
  )
}
