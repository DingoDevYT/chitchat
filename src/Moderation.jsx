import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { createStore, ensureProfiles, nicknames, profiles, toast, useProfile } from './lib/store'
import { canModerate } from './lib/roles'
import { AUDIT_ACTIONS, BAN_PURGE, INVITE_AGES, INVITE_USES, TIMEOUTS, describeAudit, inviteState, leftText, postBlock, relTime, timedOut, usesText } from './lib/moderation'
import { canModerateNow, useMemberRoles } from './Roles'
import { app, copy, menuExtras } from './menus'
import Avatar, { Critter } from './Avatar'
import Markdown from './Markdown'
import Modal from './Modal'
import { ask } from './Dialog'
import BaseIcon from './icons/Icon'
import './styles/moderation.css'

// Community & moderation UI: invites, bans, timeouts, nicknames, private notes, audit log, rules screening.
// Every action goes through an RPC or RLS in 032_moderation.sql; checks here only decide what to show.

const Icon = ({ name, size = 16 }) => <BaseIcon name={name} size={size} className="mod-ico" />

const inviteUrl = code => `${location.origin}${location.pathname}#/invite/${code}`
// Name as this server shows it: nickname, then display name, then username.
const shownName = id => nicknames.get().map[id] || profiles.get()[id]?.display_name || profiles.get()[id]?.username || 'someone'
const memberOf = id => app.members.find(m => m.user_id === id)

// ── badges, gates, profile-card bits ──

// Moderators see a little clock on timed-out members.
export function TimeoutBadge({ m, uid, ctx }) {
  m = m || memberOf(uid)
  // shortcut: checked at render, so it can linger past expiry until the list re-renders; fine for a hint
  if (!m || !ctx.can('timeout_members') || !timedOut(m)) return null
  const t = new Date(m.timeout_until).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return <span className="mod-clock" role="img" title={`Timed out until ${t}`} aria-label={`Timed out until ${t}`}><Icon name="clock" size={14} /></span>
}

// Wraps the composer: a timeout banner or the rules card instead, while you can't post here.
export function PostGate({ ctx, children }) {
  const [now, setNow] = useState(Date.now)
  const block = postBlock(ctx.server, ctx.member, ctx.can('manage_server'), now)
  useEffect(() => {
    if (block !== 'timeout') return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [block, ctx.member?.timeout_until])
  if (block === 'timeout') return (
    <div className="mod-gate pop" role="status">
      <Icon name="clock" size={22} />
      <div className="col">
        <b>You're in a timeout</b>
        <span className="muted small">{leftText(Date.parse(ctx.member.timeout_until) - now)} to go. You can still read along.</span>
      </div>
    </div>
  )
  if (block === 'rules') return <RulesCard ctx={ctx} />
  return children
}

function RulesCard({ ctx }) {
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  async function agree() {
    setBusy(true)
    const { error } = await supabase.rpc('agree_to_rules', { sid: ctx.server.id })
    setBusy(false)
    if (error) toast(error.message) // on success the member row updates and this card steps aside
  }
  return (
    <div className="mod-rules pop">
      <div className="mod-rules-head">
        <Critter size={44} />
        <div className="col">
          <b>Welcome to {ctx.server.name}!</b>
          <span className="muted small">Chit says: have a quick read of the house rules, then hop in.</span>
        </div>
      </div>
      <div className="mod-rules-text"><Markdown text={ctx.server.rules} me={ctx.me.username} /></div>
      <div className="row">
        <label className="toggle"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /><span>I've read the rules and I agree</span></label>
        <span className="spacer" />
        <button className="btn primary" disabled={!ok || busy} onClick={agree}>Start chatting</button>
      </div>
    </div>
  )
}

export function ModButtons({ ctx, id, role, onClose }) {
  const data = useMemberRoles(ctx.server?.id)
  if (!ctx.server) return null
  const m = memberOf(id), self = id === ctx.userId
  const can = perm => canModerate(data, ctx.role, ctx.userId, id, role, perm)
  const open = kind => { onClose(); openMod(kind, id) }
  return <>
    {m && (self || can('manage_nicknames')) && <button className="btn ghost" onClick={() => open('nick')}><Icon name="edit" /> {self ? 'Change my nickname' : 'Change nickname'}</button>}
    {m && can('timeout_members') && <button className="btn ghost" onClick={() => open('timeout')}><Icon name="clock" /> {timedOut(m) ? 'End timeout' : 'Time out'}</button>}
    {can('ban_members') && <button className="btn danger" onClick={() => open('ban')}><Icon name="block" /> Ban</button>}
  </>
}

// A private note on someone's profile: only you ever see it; saved to your account when you click away.
export function NoteBox({ id, ctx }) {
  const [v, setV] = useState(null) // null while loading
  const [saved, setSaved] = useState('')
  useEffect(() => {
    let on = true
    setV(null)
    supabase.from('user_notes').select('note').eq('target_id', id).maybeSingle().then(({ data }) => {
      if (on) { setV(data?.note || ''); setSaved(data?.note || '') }
    })
    return () => { on = false }
  }, [id])
  async function save() {
    const t = (v || '').trim()
    if (v === null || t === saved) return
    setSaved(t)
    const { error } = t
      ? await supabase.from('user_notes').upsert({ owner_id: ctx.userId, target_id: id, note: t, updated_at: new Date().toISOString() })
      : await supabase.from('user_notes').delete().eq('target_id', id)
    if (error) toast(error.message)
  }
  return (
    <label className="mod-note">Note
      <textarea rows={2} maxLength={256} value={v ?? ''} disabled={v === null} placeholder="Only you can see this"
        onChange={e => setV(e.target.value)} onBlur={save} />
    </label>
  )
}

// ── ban / timeout / nickname dialogs, opened from menus and profile cards ──

const modState = createStore(null) // { kind: 'ban' | 'timeout' | 'nick', uid }
export const openMod = (kind, uid) => modState.set({ kind, uid })

function personModItems(id, { ctx, members }) {
  if (!ctx?.server) return []
  const m = members.find(x => x.user_id === id), self = id === ctx.userId
  const can = perm => canModerateNow(ctx, id, m?.role, perm)
  return [
    m && (self || can('manage_nicknames')) && { label: self ? 'Change my nickname' : 'Change nickname', icon: 'edit', onClick: () => openMod('nick', id) },
    m && can('timeout_members') && { label: timedOut(m) ? 'End timeout' : 'Time out…', icon: 'clock', onClick: () => openMod('timeout', id) },
    can('ban_members') && { label: `Ban ${shownName(id)}…`, icon: 'block', danger: true, onClick: () => openMod('ban', id) },
  ].filter(Boolean)
}

export function ModHost({ ctx }) {
  const s = modState.use()
  // registered here (not at import) so menus.jsx is fully loaded whatever the import order
  useEffect(() => {
    menuExtras.person.push(personModItems)
    return () => { const i = menuExtras.person.indexOf(personModItems); if (i >= 0) menuExtras.person.splice(i, 1) }
  }, [])
  const close = useCallback(() => modState.set(null), [])
  if (!s || !ctx.server) return null
  return <ModDialog key={s.kind + s.uid} {...s} ctx={ctx} onClose={close} />
}

function ModDialog({ kind, uid, ctx, onClose }) {
  const p = useProfile(uid)
  const m = memberOf(uid)
  const sid = ctx.server.id, self = uid === ctx.userId
  const name = m?.nickname || p?.display_name || p?.username || 'them'
  const [secs, setSecs] = useState(kind === 'timeout' ? 600 : 0)
  const [reason, setReason] = useState('')
  const [nick, setNick] = useState(m?.nickname || '')
  const [busy, setBusy] = useState(false)
  async function run(fn, args, done) {
    setBusy(true)
    const { error } = await supabase.rpc(fn, { sid, uid, ...args })
    setBusy(false)
    if (error) return toast(error.message)
    toast(done)
    onClose()
  }
  const reasonBox = <label><span>Reason <span className="muted">(optional, shows in the audit log)</span></span>
    <input value={reason} maxLength={512} onChange={e => setReason(e.target.value)} /></label>

  if (kind === 'nick') return (
    <Modal title={self ? 'Your nickname here' : `Nickname for ${p?.display_name || p?.username || 'them'}`} onClose={onClose}>
      <form className="col" onSubmit={e => { e.preventDefault(); run('set_nickname', { nick }, nick.trim() ? 'Nickname saved' : 'Nickname cleared') }}>
        <p className="muted small">Shown instead of {self ? 'your' : 'their'} display name in {ctx.server.name}: messages, the member list and mentions.</p>
        <label>Nickname<input autoFocus value={nick} maxLength={32} placeholder={p?.display_name || p?.username} onChange={e => setNick(e.target.value)} /></label>
        <div className="row mod-actions">
          {m?.nickname && <button type="button" className="btn ghost" disabled={busy} onClick={() => run('set_nickname', { nick: '' }, 'Nickname cleared')}>Reset</button>}
          <span className="spacer" />
          <button className="btn primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  )

  if (kind === 'timeout') return (
    <Modal title={`Time out ${name}`} onClose={onClose}>
      <form className="col" onSubmit={e => { e.preventDefault(); run('timeout_member', { secs, reason }, `${name} is in a timeout`) }}>
        <p className="muted small">They can still read, but can't post, react, share in galleries or join stadiums here until it ends.</p>
        {timedOut(m) && <div className="note row">Timed out for {leftText(Date.parse(m.timeout_until) - Date.now())} more.
          <span className="spacer" /><button type="button" className="btn ghost small" disabled={busy} onClick={() => run('timeout_member', { secs: 0 }, 'Timeout ended')}>End it now</button></div>}
        <div className="mod-pills" role="radiogroup" aria-label="How long">
          {TIMEOUTS.map(([l, s]) => <button type="button" key={s} role="radio" aria-checked={secs === s} className={secs === s ? 'on' : ''} onClick={() => setSecs(s)}>{l}</button>)}
        </div>
        {reasonBox}
        <div className="row mod-actions"><span className="spacer" /><button className="btn primary" disabled={busy}>{timedOut(m) ? 'Restart timeout' : 'Time out'}</button></div>
      </form>
    </Modal>
  )

  return (
    <Modal title={`Ban ${name}`} onClose={onClose}>
      <form className="col" onSubmit={e => { e.preventDefault(); run('ban_member', { reason, purge: secs }, `${name} was banned`) }}>
        <p className="muted small">They'll be removed from {ctx.server.name} and can't come back through any invite until the ban is lifted (Server settings, Bans).</p>
        <label>Delete their recent messages
          <select value={secs} onChange={e => setSecs(+e.target.value)}>{BAN_PURGE.map(([l, s]) => <option key={s} value={s}>{l}</option>)}</select>
        </label>
        {reasonBox}
        <div className="row mod-actions"><span className="spacer" /><button className="btn danger" disabled={busy}>Ban</button></div>
      </form>
    </Modal>
  )
}

// ── Server settings tabs ──

export function InvitesTab({ ctx }) {
  const sid = ctx.server.id
  const [list, setList] = useState(null)
  const [ttl, setTtl] = useState(604800)
  const [cap, setCap] = useState(0)
  profiles.use() // creator names fill in as they load
  const load = useCallback(() => supabase.from('invites').select('*').eq('server_id', sid).order('created_at', { ascending: false })
    .then(({ data, error }) => {
      if (error) return toast(error.message)
      setList(data)
      ensureProfiles(data.map(i => i.created_by))
    }), [sid])
  useEffect(() => { load() }, [load])
  async function create() {
    const { data, error } = await supabase.rpc('create_invite', { sid, ttl, cap })
    if (error) return toast(error.message)
    copy(inviteUrl(data), 'New invite link copied')
    load()
  }
  async function revoke(inv) {
    if (!await ask({ text: `Revoke the invite ${inv.code}? The link stops working right away.`, confirm: 'Revoke', danger: true })) return
    const { error } = await supabase.from('invites').delete().eq('code', inv.code)
    if (error) return toast(error.message)
    load()
  }
  async function setMembersCan(on) {
    const { error } = await supabase.from('servers').update({ members_can_invite: on }).eq('id', sid)
    if (error) return toast(error.message)
    ctx.load()
  }
  return (
    <div className="col mod-tab">
      <div className="mod-create">
        <label>Expire after<select value={ttl} onChange={e => setTtl(+e.target.value)}>{INVITE_AGES.map(([l, s]) => <option key={s} value={s}>{l}</option>)}</select></label>
        <label>Max uses<select value={cap} onChange={e => setCap(+e.target.value)}>{INVITE_USES.map(([l, n]) => <option key={n} value={n}>{l}</option>)}</select></label>
        <button className="btn primary" onClick={create}><Icon name="link" /> Create link</button>
      </div>
      {ctx.can('manage_server') && <label className="toggle">
        <input type="checkbox" checked={ctx.server.members_can_invite !== false} onChange={e => setMembersCan(e.target.checked)} />
        <span>Everyone can create invite links<span className="muted small"> (otherwise only roles with Manage invites)</span></span>
      </label>}
      {list?.length === 0 && <p className="muted small">No invite links right now.</p>}
      <ul className="mod-list">
        {list?.map(inv => {
          const st = inviteState(inv)
          return (
            <li key={inv.code} className={st.live ? '' : 'dim'}>
              <code className="mod-code">{inv.code}</code>
              <span className="mod-who">{inv.created_by ? <><Avatar id={inv.created_by} size={20} /> {shownName(inv.created_by)}</> : <span className="muted">someone who left</span>}</span>
              <span className="muted small">{usesText(inv)} · {st.label}</span>
              <span className="mod-row-actions">
                {st.live && <button className="icon-btn" onClick={() => copy(inviteUrl(inv.code), 'Invite link copied')} aria-label={`Copy invite ${inv.code}`} title="Copy link"><Icon name="link" /></button>}
                <button className="icon-btn" onClick={() => revoke(inv)} aria-label={`Revoke invite ${inv.code}`} title="Revoke"><Icon name="close" /></button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function BansTab({ ctx }) {
  const sid = ctx.server.id
  const [list, setList] = useState(null)
  profiles.use()
  const load = useCallback(() => supabase.from('bans').select('*').eq('server_id', sid).order('created_at', { ascending: false })
    .then(({ data, error }) => {
      if (error) return toast(error.message)
      setList(data)
      ensureProfiles(data.flatMap(b => [b.user_id, b.banned_by]))
    }), [sid])
  useEffect(() => { load() }, [load])
  async function unban(b) {
    const { error } = await supabase.rpc('unban_member', { sid, uid: b.user_id })
    if (error) return toast(error.message)
    toast('Ban lifted')
    load()
  }
  return (
    <div className="col mod-tab">
      {list?.length === 0 && <p className="muted small">Nobody's banned. Lovely.</p>}
      <ul className="mod-list">
        {list?.map(b => {
          const p = profiles.get()[b.user_id]
          return (
            <li key={b.user_id}>
              <span className="mod-who"><Avatar id={b.user_id} size={28} /> <b>{p?.display_name || p?.username || '…'}</b> <span className="muted small">@{p?.username}</span></span>
              <span className="muted small">{b.reason ? `“${b.reason}” · ` : ''}by {b.banned_by ? shownName(b.banned_by) : 'someone'} · {relTime(b.created_at)}</span>
              <span className="mod-row-actions"><button className="btn ghost small" onClick={() => unban(b)}>Lift ban</button></span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function AuditTab({ ctx }) {
  const sid = ctx.server.id
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [list, setList] = useState(null)
  profiles.use()
  useEffect(() => {
    let on = true
    let q = supabase.from('audit_log').select('*').eq('server_id', sid).order('id', { ascending: false }).limit(100)
    if (action) q = q.eq('action', action)
    if (actor) q = q.eq('actor_id', actor)
    q.then(({ data, error }) => {
      if (!on) return
      if (error) return toast(error.message)
      setList(data)
      ensureProfiles(data.flatMap(e => [e.actor_id, e.target_id]))
    })
    return () => { on = false }
  }, [sid, action, actor])
  const people = app.members.map(m => m.user_id).sort((a, b) => shownName(a).localeCompare(shownName(b)))
  return (
    <div className="col mod-tab">
      <div className="mod-create">
        <label>Action<select value={action} onChange={e => setAction(e.target.value)}>
          <option value="">Everything</option>{AUDIT_ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>By<select value={actor} onChange={e => setActor(e.target.value)}>
          <option value="">Anyone</option>{people.map(id => <option key={id} value={id}>{shownName(id)}</option>)}</select></label>
      </div>
      {list?.length === 0 && <p className="muted small">Nothing logged{action || actor ? ' for that filter' : ' yet'}.</p>}
      <ul className="mod-list audit">
        {list?.map(e => (
          <li key={e.id}>
            {e.actor_id ? <Avatar id={e.actor_id} size={28} /> : <span className="mod-av-gap" />}
            <span className="mod-audit-line"><b>{e.actor_id ? shownName(e.actor_id) : 'Someone'}</b> {describeAudit(e, shownName)}
              {e.details?.reason && <span className="muted small"> · “{e.details.reason}”</span>}</span>
            <time className="muted small" dateTime={e.created_at} title={new Date(e.created_at).toLocaleString()}>{relTime(e.created_at)}</time>
          </li>
        ))}
      </ul>
      {list?.length === 100 && <p className="muted small">Showing the latest 100. Filter to see further back.</p>}
    </div>
  )
}

export function RulesTab({ ctx }) {
  const s = ctx.server
  const [rules, setRules] = useState(s.rules || '')
  const [on, setOn] = useState(!!s.screening_at)
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault()
    const text = rules.trim()
    if (on && !text) return toast('Write a few rules first, then switch screening on.')
    setBusy(true)
    // keep the original start time, so members who already joined stay grandfathered in
    const { error } = await supabase.from('servers').update({ rules: text || null, screening_at: on ? s.screening_at || new Date().toISOString() : null }).eq('id', s.id)
    setBusy(false)
    if (error) return toast(error.message)
    await ctx.load()
    toast('Rules saved')
  }
  return (
    <form className="col mod-tab" onSubmit={save}>
      <label>Server rules
        <textarea rows={7} maxLength={2000} value={rules} onChange={e => setRules(e.target.value)}
          placeholder={'1. Be kind.\n2. No spoilers outside the spoiler room.\n3. Have fun!'} />
        <span className="muted small mod-count">{rules.length} / 2000 · Markdown works</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} />
        <span>New members agree to the rules before they can post<span className="muted small"> (people already here aren't asked)</span></span>
      </label>
      <button className="btn primary" disabled={busy}>Save rules</button>
    </form>
  )
}
