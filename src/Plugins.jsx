import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { toast } from './lib/store'
import { ask } from './Dialog'
import { uploadFile } from './lib/upload'
import { automodRule, RULE_TEXT } from './lib/automod'
import { renderTemplate } from '../supabase/functions/plugin-runtime/shared.js'
import { useMemberRoles } from './Roles'
import { refreshCommands } from './SlashCommands'
import { Embeds } from './Embed'
import Avatar, { Name } from './Avatar'
import Markdown from './Markdown'
import Icon from './icons/Icon'
import './styles/plugins.css'

// Server settings → Plugins. Everything here goes through the security-definer RPCs in 035_plugins.sql (manage_server).
export const PERM_LABEL = {
  send_messages: 'Send messages in rooms it can see',
  read_messages: 'Read messages in rooms it can see',
  add_reactions: 'Add reactions',
  manage_roles: "Give out roles that don't grant permissions",
  timeout_members: 'Time out members',
}
export const EVENT_LABEL = {
  bot_mentioned: 'Messages that @mention it or reply to it',
  message_created: 'Every new message (needs “Read messages”)',
  member_joined: 'Someone joining the server',
  reaction_added: 'New reactions',
}
const BOT_PERMS = ['send_messages', 'read_messages', 'add_reactions', 'manage_roles']
const err = e => toast(e?.message || String(e))
const copy = (text, what = 'Copied') => navigator.clipboard?.writeText(text).then(() => toast(what), () => toast("Couldn't copy. Select it and copy by hand."))
const rooms = ctx => ctx.channels.filter(c => c.server_id === ctx.server.id && !['dm', 'thread', 'post'].includes(c.kind))

export function PluginsTab({ ctx }) {
  const sid = ctx.server.id
  const [view, setView] = useState('browse')
  const [catalog, setCatalog] = useState(null)
  const [installs, setInstalls] = useState(null)
  const [open, setOpen] = useState(null) // expanded install id

  const reload = useCallback(async () => {
    const [c, i] = await Promise.all([
      supabase.from('plugins').select('*').is('server_id', null).order('name'),
      supabase.from('server_plugins').select('*, plugin:plugins(*)').eq('server_id', sid).order('created_at'),
    ])
    if (c.error || i.error) return err(c.error || i.error)
    setCatalog(c.data)
    setInstalls(i.data)
    refreshCommands(sid)
  }, [sid])
  useEffect(() => { reload() }, [reload])

  async function install(p) {
    const { data, error } = await supabase.rpc('install_plugin', { sid, pid: p.id })
    if (error) return err(error)
    toast(`${p.name} is in! ${p.id === 'custom-commands' ? 'Now make your first command.' : 'Have a look at its settings.'}`)
    await reload()
    setOpen(data)
    setView(p.id === 'custom-commands' ? 'make' : 'added')
  }

  const byPlugin = Object.fromEntries((installs || []).map(i => [i.plugin_id, i]))
  return (
    <div className="plugins-tab">
      <div className="pl-intro">
        <span className="pl-intro-text">Plugins add bots and handy tools to <b>{ctx.server.name}</b>. Bots show up as members with a <span className="bot-badge">BOT</span> badge.</span>
        <a className="btn ghost small" href="#/docs" target="_blank" rel="noopener"><Icon name="file-text" size={16} /> Plugin docs</a>
      </div>
      <div className="pl-views" role="tablist" aria-label="Plugins">
        {[['browse', 'Browse'], ['added', `Added${installs?.length ? ` (${installs.length})` : ''}`], ['make', 'Make your own']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>
      {!catalog || !installs ? <div className="loading-msgs">{[0, 1].map(i => <div key={i} className="skeleton" />)}</div>
        : view === 'browse' ? <div className="pl-grid">
          {catalog.map(p => <PluginCard key={p.id} p={p} added={!!byPlugin[p.id]} onAdd={() => install(p)}
            onOpen={() => { setOpen(byPlugin[p.id].id); setView(p.id === 'custom-commands' ? 'make' : 'added') }} />)}
          <div className="pl-card pl-card-own">
            <div className="pl-card-head"><span className="pl-icon"><Icon name="link" /></span><div><h3>Your own bot</h3><span className="muted small">by you</span></div></div>
            <p>Connect a bot you wrote (or one a friend wrote). It gets events from this server and talks back through the Bot API.</p>
            <button className="btn ghost" onClick={() => setView('make')}>Connect a bot</button>
          </div>
        </div>
        : view === 'added' ? <div className="col pl-list">
          {installs.length === 0 && <p className="muted pl-empty">Nothing added yet. Pick something from Browse.</p>}
          {installs.map(i => <Installed key={i.id} i={i} ctx={ctx} open={open === i.id} onToggle={() => setOpen(o => o === i.id ? null : i.id)}
            reload={reload} onEditCommands={() => setView('make')} />)}
        </div>
        : <Make ctx={ctx} custom={byPlugin['custom-commands']} onInstallCustom={() => install(catalog.find(p => p.id === 'custom-commands'))} reload={reload}
            onCreated={async id => { await reload(); setOpen(id) }} />}
    </div>
  )
}

function PluginCard({ p, added, onAdd, onOpen }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="pl-card">
      <div className="pl-card-head">
        <span className="pl-icon"><Icon name={p.icon || 'sparkle'} /></span>
        <div><h3>{p.name}</h3><span className="muted small">by {p.author}</span></div>
      </div>
      <p>{p.description}</p>
      {p.commands?.length > 0 && <div className="pl-cmds">{p.commands.map(c => <code key={c.name}>/{c.name}</code>)}</div>}
      <div className="pl-perms small"><b>It can:</b> {p.permissions.map(x => PERM_LABEL[x]).join(' · ')}</div>
      {added ? <button className="btn ghost" onClick={onOpen}><Icon name="check" size={16} /> Added: open settings</button>
        : <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await onAdd(); setBusy(false) }}>{busy ? 'Adding…' : `Add ${p.name}`}</button>}
    </div>
  )
}

// ── one added plugin ──
function Installed({ i, ctx, open, onToggle, reload, onEditCommands }) {
  const p = i.plugin
  const [cfg, setCfg] = useState(i.config)
  const [perms, setPerms] = useState(i.permissions)
  const [url, setUrl] = useState(p.webhook_url || '')
  const [evs, setEvs] = useState(i.events)
  const [secrets, setSecrets] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setCfg(i.config); setPerms(i.permissions); setUrl(p.webhook_url || ''); setEvs(i.events) }, [i, p.webhook_url])
  const webhook = p.kind === 'webhook'
  const asked = webhook ? BOT_PERMS : p.permissions
  const dirty = JSON.stringify(cfg) !== JSON.stringify(i.config) || perms.join() !== i.permissions.join()
    || (webhook && (url !== (p.webhook_url || '') || evs.join() !== i.events.join()))
  const brokeOff = !i.enabled && i.failures >= 10

  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('configure_plugin', { iid: i.id, cfg, perms,
      url: webhook ? url : null, evs: webhook ? evs : null })
    setBusy(false)
    if (error) return err(error)
    toast('Saved.')
    reload()
  }
  async function setOn(en) {
    const { error } = await supabase.rpc('configure_plugin', { iid: i.id, en })
    if (error) return err(error)
    reload()
  }
  async function remove() {
    if (!await ask({ text: `Remove ${p.name} from ${ctx.server.name}?${webhook ? ' Its token stops working right away.' : ''} You can add it again later.`, confirm: 'Remove', danger: true })) return
    const { error } = await supabase.rpc('uninstall_plugin', { iid: i.id })
    if (error) return err(error)
    toast(`${p.name} was removed.`)
    reload()
  }
  async function regenerate() {
    if (!await ask({ text: 'Make a new token and signing secret? The old ones stop working immediately, so update your bot right after.', confirm: 'Make new ones', danger: true })) return
    const { data, error } = await supabase.rpc('regenerate_bot_secrets', { iid: i.id })
    if (error) return err(error)
    setSecrets(data)
  }
  async function ping() {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('plugin-runtime', { body: { type: 'ping', install_id: i.id } })
    setBusy(false)
    if (error) { let m = error.message; try { m = (await error.context.json()).error } catch {} return toast(m) }
    toast(data.ok ? `Your bot answered (HTTP ${data.status}). All good!` : `No luck: ${data.error || `HTTP ${data.status}`}`)
    reload()
  }

  return (
    <div className={`pl-installed${open ? ' open' : ''}${i.enabled ? '' : ' off'}`}>
      <div className="pl-inst-head">
        <button className="pl-inst-title" onClick={onToggle} aria-expanded={open}>
          {webhook ? <Avatar id={i.bot_user_id} size={32} /> : <span className="pl-icon small"><Icon name={p.icon || 'sparkle'} /></span>}
          <span><b>{p.name}</b><span className="muted small"> {brokeOff ? '· turned off after delivery errors' : i.enabled ? '· on' : '· off'}</span></span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} />
        </button>
        <label className="toggle" title={i.enabled ? 'Turn off' : 'Turn on'}>
          <input type="checkbox" checked={i.enabled} onChange={e => setOn(e.target.checked)} aria-label={`${p.name} on`} />
        </label>
      </div>
      {open && <div className="pl-inst-body">
        {p.id === 'custom-commands' && <div className="row pl-row">
          <span>{(i.commands || []).length} custom command{(i.commands || []).length === 1 ? '' : 's'}.</span>
          <button className="btn ghost small" onClick={onEditCommands}>Edit commands</button>
        </div>}
        {p.config_schema?.length > 0 && <div className="col pl-form">
          {p.config_schema.map(f => <Field key={f.key} f={f} v={cfg[f.key]} set={v => setCfg(c => ({ ...c, [f.key]: v }))} ctx={ctx} />)}
        </div>}
        {p.id === 'automod' && <AutomodPreview cfg={cfg} />}
        {webhook && <div className="col pl-form">
          <label>Webhook address (where events and commands are sent)
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://my-bot.example.com/chitchat" maxLength={500} />
          </label>
          <fieldset className="pl-checks"><legend>Send it these events</legend>
            {Object.entries(EVENT_LABEL).map(([k, l]) => (
              <label key={k} className="pl-check"><input type="checkbox" checked={evs.includes(k)} disabled={!url}
                onChange={e => setEvs(v => e.target.checked ? [...v, k] : v.filter(x => x !== k))} /> <span>{l}</span></label>
            ))}
          </fieldset>
          {(i.commands || []).length > 0 && <div className="small"><b>Its commands:</b> {(i.commands || []).map(c => <code key={c.name}>/{c.name}</code>)}</div>}
        </div>}
        <fieldset className="pl-checks"><legend>It can</legend>
          {asked.map(k => (
            <label key={k} className="pl-check"><input type="checkbox" checked={perms.includes(k)}
              onChange={e => setPerms(v => e.target.checked ? [...v, k] : v.filter(x => x !== k))} /> <span>{PERM_LABEL[k]}</span></label>
          ))}
        </fieldset>
        {i.last_errors?.length > 0 && <div className="pl-errors">
          <b className="small">Recent problems</b>
          {i.last_errors.map((e, n) => <div key={n} className="small"><time className="muted">{new Date(e.at).toLocaleString()}</time> {e.error}</div>)}
        </div>}
        {secrets && <SecretBox s={secrets} onDone={() => setSecrets(null)} />}
        <div className="row pl-actions">
          <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
          {webhook && <button className="btn ghost" disabled={!url || busy} onClick={ping}>Send a test ping</button>}
          {webhook && <button className="btn ghost" onClick={regenerate}>New token & secret</button>}
          <span className="spacer" />
          <button className="btn danger" onClick={remove}>Remove</button>
        </div>
      </div>}
    </div>
  )
}

// Auto-built form field from a plugin's config_schema (public.clean_plugin_config re-checks everything on save).
function Field({ f, v, set, ctx }) {
  const roles = useMemberRoles(ctx.server.id).roles
  const help = f.help && <span className="muted small pl-help">{f.help}</span>
  const toggle = (list, id) => (list || []).includes(id) ? list.filter(x => x !== id) : [...(list || []), id]
  switch (f.type) {
    case 'boolean':
      return <label className="pl-check"><input type="checkbox" checked={!!v} onChange={e => set(e.target.checked)} /> <span>{f.label}{help}</span></label>
    case 'number':
      return <label>{f.label}<input type="number" min={f.min} max={f.max} value={v ?? ''} onChange={e => set(e.target.value === '' ? '' : Number(e.target.value))} />{help}</label>
    case 'select':
      return <label>{f.label}<select value={v ?? f.default} onChange={e => set(e.target.value)}>{f.options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>{help}</label>
    case 'list':
      return <label>{f.label}<textarea rows={4} value={(v || []).join('\n')} placeholder="One per line" onChange={e => set(e.target.value.split('\n'))} />{help}</label>
    case 'roles':
      return <div className="pl-chips-field"><span>{f.label}</span>
        <div className="pl-chips">{roles.length ? roles.map(r => <button type="button" key={r.id} aria-pressed={(v || []).includes(r.id)}
          className={`pl-chip${(v || []).includes(r.id) ? ' on' : ''}`} style={r.color ? { '--chip': r.color } : undefined}
          onClick={() => set(toggle(v, r.id))}>{r.name}</button>) : <span className="muted small">No roles yet.</span>}</div>{help}</div>
    case 'rooms':
      return <div className="pl-chips-field"><span>{f.label}</span>
        <div className="pl-chips">{rooms(ctx).map(c => <button type="button" key={c.id} aria-pressed={(v || []).includes(c.id)}
          className={`pl-chip${(v || []).includes(c.id) ? ' on' : ''}`} onClick={() => set(toggle(v, c.id))}>{c.name}</button>)}</div>{help}</div>
    case 'room':
      return <label>{f.label}<select value={v || ''} onChange={e => set(e.target.value)}><option value="">None</option>
        {rooms(ctx).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{help}</label>
    case 'textarea':
      return <label>{f.label}<textarea rows={3} maxLength={f.max || 500} value={v || ''} onChange={e => set(e.target.value)} />{help}</label>
    default:
      return <label>{f.label}<input value={v || ''} maxLength={f.max || 500} onChange={e => set(e.target.value)} />{help}</label>
  }
}

function AutomodPreview({ cfg }) {
  const [t, setT] = useState('')
  const rule = t.trim() ? automodRule({ ...cfg, words: (cfg.words || []).map(w => w.trim()).filter(Boolean) }, t) : undefined
  return (
    <div className="pl-preview">
      <label>Try a message<input value={t} onChange={e => setT(e.target.value)} placeholder="Type something to see what Automod would do" /></label>
      {rule !== undefined && <div className={`pl-verdict small${rule ? ' bad' : ''}`} role="status">
        <Icon name={rule ? 'shield' : 'check'} size={15} /> {rule ? `Held back: ${RULE_TEXT[rule]}.` : 'This would go through.'}
      </div>}
      <span className="muted small">Uses the settings above, even before you save. Bursts and repeats are checked when people actually send.</span>
    </div>
  )
}

function SecretBox({ s, onDone }) {
  return (
    <div className="pl-secret" role="alert">
      <b><Icon name="warning" size={16} /> Copy these now. They're only shown once.</b>
      <label>Bot token <span className="muted small">(your bot sends it as “Authorization: Bot …”)</span>
        <div className="row"><input readOnly value={s.token} onFocus={e => e.target.select()} /><button className="btn ghost small" onClick={() => copy(s.token, 'Token copied')}>Copy</button></div></label>
      <label>Signing secret <span className="muted small">(your bot uses it to check that events really came from Chitchat)</span>
        <div className="row"><input readOnly value={s.signing_secret} onFocus={e => e.target.select()} /><button className="btn ghost small" onClick={() => copy(s.signing_secret, 'Secret copied')}>Copy</button></div></label>
      <span className="small">Keep them out of screenshots and public code. Next: <a href="#/docs/build-a-bot" target="_blank" rel="noopener">build your bot in 10 minutes</a>.</span>
      <button className="btn primary small" onClick={onDone}>I've saved them</button>
    </div>
  )
}

// ── Make your own: no-code custom commands, and the external bot wizard ──
function Make({ ctx, custom, onInstallCustom, reload, onCreated }) {
  const [tab, setTab] = useState('commands')
  return (
    <div className="col">
      <div className="pl-views pl-views-sub" role="tablist" aria-label="Make your own">
        <button role="tab" aria-selected={tab === 'commands'} className={tab === 'commands' ? 'on' : ''} onClick={() => setTab('commands')}><Icon name="sparkle" size={16} /> Custom commands</button>
        <button role="tab" aria-selected={tab === 'bot'} className={tab === 'bot' ? 'on' : ''} onClick={() => setTab('bot')}><Icon name="link" size={16} /> Connect an external bot</button>
      </div>
      {tab === 'commands'
        ? custom ? <CustomCommands ctx={ctx} i={custom} reload={reload} />
          : <div className="pl-card pl-start">
            <h3>Make your own slash commands</h3>
            <p>No code needed. For example <code>/hug</code> could reply “<b>Pip</b> gives everyone a big hug!”, or <code>/pick</code> could choose a random game.
              Chit (our mascot bot) answers them.</p>
            <button className="btn primary" onClick={onInstallCustom}>Turn on custom commands</button>
          </div>
        : <BotWizard ctx={ctx} onCreated={onCreated} />}
    </div>
  )
}

const VARS = [['{user}', 'their name'], ['{mention}', 'pings them'], ['{server}', 'server name'], ['{room}', 'room name'],
  ['{args}', 'what they typed after the command'], ['{random:a|b|c}', 'one at random']]
const BLANK = { name: '', description: '', reply: '', embed: null, roles: [], ephemeral: false }

function CustomCommands({ ctx, i, reload }) {
  const list = i.commands || []
  const [edit, setEdit] = useState(null) // { index, cmd }
  async function saveAll(next, msg) {
    const { error } = await supabase.rpc('save_custom_commands', { iid: i.id, cmds: next })
    if (error) { err(error); return false }
    toast(msg)
    await reload()
    return true
  }
  if (edit) return <CommandEditor ctx={ctx} botId={i.bot_user_id} cmd={edit.cmd} taken={list.filter((_, n) => n !== edit.index).map(c => c.name)}
    onCancel={() => setEdit(null)}
    onSave={async c => {
      const next = edit.index == null ? [...list, c] : list.map((x, n) => n === edit.index ? c : x)
      if (await saveAll(next, `Saved /${c.name}. Try it in any room!`)) setEdit(null)
    }} />
  return (
    <div className="col">
      <div className="row pl-row"><span className="muted">Commands you make show up when anyone types <code>/</code> in this server.</span><span className="spacer" />
        <button className="btn primary small" disabled={list.length >= 50} onClick={() => setEdit({ index: null, cmd: BLANK })}><Icon name="plus" size={16} /> New command</button></div>
      {list.length === 0 && <p className="muted pl-empty">No commands yet. Make one: it takes a minute.</p>}
      {list.map((c, n) => (
        <div key={c.name} className="pl-cmd-row">
          <div><code>/{c.name}</code> <span className="muted small">{c.description}</span>
            <div className="small muted">{c.roles?.length ? 'Some roles only · ' : ''}{c.ephemeral ? 'Only the user sees the reply · ' : ''}{c.embed ? 'Has an embed' : ''}</div></div>
          <span className="spacer" />
          <button className="btn ghost small" onClick={() => setEdit({ index: n, cmd: c })}>Edit</button>
          <button className="icon-btn" aria-label={`Delete /${c.name}`} title="Delete"
            onClick={async () => { if (await ask({ text: `Delete /${c.name}?`, confirm: 'Delete', danger: true })) saveAll(list.filter((_, k) => k !== n), `Deleted /${c.name}.`) }}><Icon name="trash" size={18} /></button>
        </div>
      ))}
    </div>
  )
}

function CommandEditor({ ctx, botId, cmd, taken, onSave, onCancel }) {
  const [c, setC] = useState(cmd)
  const [busy, setBusy] = useState(false)
  const replyRef = useRef(null)
  const roles = useMemberRoles(ctx.server.id).roles
  const set = patch => setC(x => ({ ...x, ...patch }))
  const name = c.name.trim().toLowerCase().replace(/^\//, '')
  const problem = !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name) ? 'Names are one word: letters, numbers, - and _.'
    : taken.includes(name) ? `You already have /${name}.` : !c.reply.trim() && !(c.embed?.title || c.embed?.description) ? 'Write a reply (or add an embed).' : null
  function insertVar(v) {
    const el = replyRef.current, at = el ? el.selectionStart : c.reply.length
    set({ reply: c.reply.slice(0, at) + v + c.reply.slice(at) })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + v.length, at + v.length) })
  }
  // live preview with you as the person using it
  const vars = { user: ctx.me.display_name || ctx.me.username, mention: '@' + ctx.me.username, server: ctx.server.name, room: 'general', args: 'something' }
  const pv = useMemo(() => {
    const r = s => (s ? renderTemplate(s, vars, () => 0) : '')
    return { content: r(c.reply), embeds: c.embed && (c.embed.title || c.embed.description) ? [{ title: r(c.embed.title), description: r(c.embed.description), color: c.embed.color }] : [] }
  }, [c]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form className="col pl-editor" onSubmit={async e => { e.preventDefault(); if (problem) return toast(problem); setBusy(true); await onSave({ ...c, name }); setBusy(false) }}>
      <div className="pl-two">
        <label>Name<div className="pl-slash"><span>/</span><input value={c.name} maxLength={32} onChange={e => set({ name: e.target.value.replace(/\s/g, '') })} placeholder="hug" autoFocus /></div></label>
        <label>Description<input value={c.description} maxLength={100} onChange={e => set({ description: e.target.value })} placeholder="Give everyone a hug" /></label>
      </div>
      <label>Reply<textarea ref={replyRef} rows={3} maxLength={2000} value={c.reply} onChange={e => set({ reply: e.target.value })} placeholder="{user} gives {args} a big hug!" /></label>
      <div className="pl-vars">{VARS.map(([v, l]) => <button type="button" key={v} className="pl-chip" title={l} onClick={() => insertVar(v)}>{v} <span className="muted">{l}</span></button>)}</div>
      <label className="pl-check"><input type="checkbox" checked={!!c.embed} onChange={e => set({ embed: e.target.checked ? { title: '', description: '', color: '#ffd36e' } : null })} /> <span>Add an embed card</span></label>
      {c.embed && <div className="pl-two">
        <label>Card title<input value={c.embed.title || ''} maxLength={256} onChange={e => set({ embed: { ...c.embed, title: e.target.value } })} /></label>
        <label>Colour<input type="color" value={c.embed.color || '#ffd36e'} onChange={e => set({ embed: { ...c.embed, color: e.target.value } })} /></label>
        <label className="pl-wide">Card text<textarea rows={2} maxLength={2000} value={c.embed.description || ''} onChange={e => set({ embed: { ...c.embed, description: e.target.value } })} /></label>
      </div>}
      <div className="pl-chips-field"><span>Who can use it <span className="muted small">(nobody picked = everyone)</span></span>
        <div className="pl-chips">{roles.length ? roles.map(r => <button type="button" key={r.id} aria-pressed={c.roles.includes(r.id)} className={`pl-chip${c.roles.includes(r.id) ? ' on' : ''}`}
          style={r.color ? { '--chip': r.color } : undefined} onClick={() => set({ roles: c.roles.includes(r.id) ? c.roles.filter(x => x !== r.id) : [...c.roles, r.id] })}>{r.name}</button>)
          : <span className="muted small">Make roles in the Roles tab to limit commands to them.</span>}</div></div>
      <label className="pl-check"><input type="checkbox" checked={c.ephemeral} onChange={e => set({ ephemeral: e.target.checked })} /> <span>Only the person who used it sees the reply</span></label>
      <div className="pl-preview">
        <span className="muted small">Preview</span>
        <div className="pl-preview-msg">
          <Avatar id={botId} size={32} />
          <div><Name id={botId} />{c.ephemeral && <span className="eph-tag"><Icon name="eye-off" size={12} /> Only you can see this</span>}
            {pv.content && <div className="msg-text"><Markdown text={pv.content} me={ctx.me.username} /></div>}
            <Embeds list={pv.embeds} me={ctx.me.username} />
            {!pv.content && !pv.embeds.length && <div className="muted small">Your reply shows here.</div>}</div>
        </div>
      </div>
      <div className="row pl-actions">
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save command'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        {problem && <span className="muted small">{problem}</span>}
      </div>
    </form>
  )
}

function BotWizard({ ctx, onCreated }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [url, setUrl] = useState('')
  const [evs, setEvs] = useState(['bot_mentioned'])
  const [perms, setPerms] = useState(['send_messages'])
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState(null)
  const okUrl = !url || /^https:\/\/[a-z0-9.-]+(:443)?(\/\S*)?$/i.test(url.trim())

  async function pickAvatar(input) {
    const f = input.files[0]
    input.value = ''
    if (!f) return
    setBusy(true)
    try { setAvatar((await uploadFile(f, ctx.userId)).url) } catch (e) { err(e) }
    setBusy(false)
  }
  async function create() {
    setBusy(true)
    const { data, error } = await supabase.rpc('create_webhook_bot', { sid: ctx.server.id, bot_name: name.trim(), avatar, url: url.trim() || null,
      evs: url.trim() ? evs : [], perms })
    setBusy(false)
    if (error) return err(error)
    setMade(data)
  }

  if (made) return (
    <div className="col">
      <p><b>{name}</b> joined {ctx.server.name}! Here are its keys.</p>
      <SecretBox s={made} onDone={() => { onCreated(made.install_id); setMade(null); setStep(1); setName(''); setAvatar(null); setUrl('') }} />
      <details className="pl-try"><summary>Try it right now</summary>
        <p className="small">Paste this in a terminal to make your bot say hi (it needs a room id: <code>GET /rooms</code> lists them).</p>
        <pre className="pl-code">{`curl -H "Authorization: Bot ${made.token}" \\\n  https://nilludyavkfqwastghmw.supabase.co/functions/v1/bot-api/rooms`}</pre>
      </details>
    </div>
  )
  return (
    <div className="col pl-wizard">
      <ol className="pl-steps">{['Name and look', 'Events', 'Permissions'].map((s, n) => <li key={s} className={step === n + 1 ? 'on' : step > n + 1 ? 'done' : ''}>{s}</li>)}</ol>
      {step === 1 && <>
        <p className="muted">Your bot gets its own member card with a BOT badge. You'll write its code yourself (the docs walk you through it).</p>
        <label>Bot name<input value={name} maxLength={32} onChange={e => setName(e.target.value)} placeholder="Weather Frog" autoFocus /></label>
        <div className="row">{avatar ? <img className="pl-av" src={avatar} alt="" /> : <span className="pl-av blank"><Icon name="image" /></span>}
          <label className="btn ghost small">{busy ? 'Uploading…' : avatar ? 'Change picture' : 'Add a picture (optional)'}<input type="file" accept="image/*" hidden onChange={e => pickAvatar(e.target)} /></label></div>
        <div className="row pl-actions"><button className="btn primary" disabled={!name.trim() || busy} onClick={() => setStep(2)}>Next</button></div>
      </>}
      {step === 2 && <>
        <label>Webhook address <span className="muted small">(optional: where Chitchat sends events and slash commands)</span>
          <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://my-bot.example.com/chitchat" maxLength={500} /></label>
        {!okUrl && <span className="small pl-bad">Use a public https:// address (no ports or local addresses).</span>}
        <fieldset className="pl-checks" disabled={!url}><legend>Send it these events</legend>
          {Object.entries(EVENT_LABEL).map(([k, l]) => <label key={k} className="pl-check"><input type="checkbox" checked={evs.includes(k)}
            onChange={e => setEvs(v => e.target.checked ? [...v, k] : v.filter(x => x !== k))} /> <span>{l}</span></label>)}
        </fieldset>
        {!url && <span className="muted small">No address? That's fine for bots that only post (like a daily reminder). You can add one later.</span>}
        <div className="row pl-actions"><button className="btn ghost" onClick={() => setStep(1)}>Back</button><button className="btn primary" disabled={!okUrl} onClick={() => setStep(3)}>Next</button></div>
      </>}
      {step === 3 && <>
        <fieldset className="pl-checks"><legend>What it can do</legend>
          {BOT_PERMS.map(k => <label key={k} className="pl-check"><input type="checkbox" checked={perms.includes(k)}
            onChange={e => setPerms(v => e.target.checked ? [...v, k] : v.filter(x => x !== k))} /> <span>{PERM_LABEL[k]}</span></label>)}
        </fieldset>
        {evs.includes('message_created') && url && !perms.includes('read_messages') && <span className="small pl-bad">“Every new message” only arrives if it can read messages.</span>}
        <span className="muted small">A bot can never do more than you can. You can change all of this later in Added.</span>
        <div className="row pl-actions"><button className="btn ghost" onClick={() => setStep(2)}>Back</button>
          <button className="btn primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : `Create ${name.trim() || 'bot'}`}</button></div>
      </>}
    </div>
  )
}
