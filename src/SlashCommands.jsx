import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { createStore, toast } from './lib/store'
import { findCommand, optionLabel, parseCommand, suggest } from './lib/slash'
import Avatar, { Name } from './Avatar'
import Markdown from './Markdown'
import { Embeds } from './Embed'
import Icon from './icons/Icon'
import './styles/plugins.css'

// ── the server's slash commands (public.server_commands), cached a minute per server ──
const registry = createStore({}) // serverId -> { at, list }
const EMPTY = []
export async function loadCommands(sid, force) {
  const cur = registry.get()[sid]
  if (!force && cur && Date.now() - cur.at < 60000) return cur.list
  const { data } = await supabase.rpc('server_commands', { sid })
  registry.set(s => ({ ...s, [sid]: { at: Date.now(), list: data || [] } }))
  return data || []
}
export const refreshCommands = sid => sid && loadCommands(sid, true)

// ── ephemeral replies: only you see them, and they're gone when you reload ──
export const ephemerals = createStore([]) // { id, channelId, bot_user_id, plugin, command, ix?, pending?, error?, content?, embeds? }
const put = e => ephemerals.set(l => [...l.filter(x => x.id !== e.id), e].slice(-20))
const drop = id => ephemerals.set(l => l.filter(x => x.id !== id))
const watching = new Map() // interaction id -> stop()

// A public reply to a deferred command arrived (Chat's realtime feed): clear its "thinking…" line.
export function resolveInteraction(ix) {
  watching.get(ix)?.()
  if (ephemerals.get().some(e => e.ix === ix && e.pending)) ephemerals.set(l => l.filter(e => !(e.ix === ix && e.pending)))
}

// Bots that answer later (bot-api /interactions/:id/reply) put ephemeral replies on the interaction row; listen until then.
function watch(base, ix) {
  const ch = supabase.channel('ix:' + ix)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plugin_interactions', filter: `id=eq.${ix}` }, ({ new: row }) => {
      if (!row.response) return
      put({ ...base, ix, content: row.response.content, embeds: row.response.embeds })
      stop()
    })
    .subscribe()
  const t = setTimeout(() => { if (ephemerals.get().some(e => e.id === base.id && e.pending)) drop(base.id); stop() }, 15 * 60000)
  function stop() { clearTimeout(t); supabase.removeChannel(ch); watching.delete(ix) }
  watching.set(ix, stop)
}

export async function runCommand(channelId, cmd, options) {
  const base = { id: 'eph-' + crypto.randomUUID(), channelId, bot_user_id: cmd.bot_user_id, plugin: cmd.plugin, command: cmd.name }
  put({ ...base, pending: true })
  const { data, error } = await supabase.functions.invoke('plugin-runtime', {
    body: { type: 'command', channel_id: channelId, install_id: cmd.install_id, name: cmd.name, options },
  })
  if (error) {
    let msg = "Couldn't reach the plugin. Check your connection and try again."
    try { msg = (await error.context.json()).error || msg } catch { /* network error: keep the default */ }
    return put({ ...base, error: msg })
  }
  if (data?.ephemeral) return put({ ...base, ...data.ephemeral })
  if (data?.deferred) { put({ ...base, pending: true, ix: data.interaction_id }); return watch(base, data.interaction_id) }
  drop(base.id) // a public reply: it arrives in the room like any message
}

// Why Automod held back your last message here (public.automod_hits, readable only by you).
export async function heldBackReason(channelId, userId) {
  const { data } = await supabase.from('automod_hits').select('reason, created_at').eq('user_id', userId).eq('channel_id', channelId)
    .order('id', { ascending: false }).limit(1).maybeSingle()
  return data && Date.now() - Date.parse(data.created_at) < 120000 ? data.reason : null
}

// Composer hook, same shape as the emoji/mention autocompletes: onKeyDown, popup, plus submit() for Enter.
export function useSlashCommands(ref, text, setText, channelId, serverId) {
  const list = registry.use(s => s[serverId]?.list) || EMPTY
  const [sel, setSel] = useState(0)
  const [closedFor, setClosedFor] = useState(null) // Escape hides it until the text changes
  const typing = !!serverId && text.startsWith('/')
  useEffect(() => { if (serverId) loadCommands(serverId) }, [typing, serverId]) // on open (so a quick "/cmd" + Enter works), and each new "/"
  const s = typing && text !== closedFor ? suggest(text, list) : null
  const items = s?.items || EMPTY
  const cur = Math.min(sel, items.length - 1)

  function choose(c) {
    const t = '/' + c.name + (c.options?.length ? ' ' : '')
    setText(t)
    setSel(0)
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(t.length, t.length) })
  }

  const cmd = s?.cmd
  const parsed = cmd ? parseCommand(text, cmd) : null
  const next = cmd && parsed?.missing

  return {
    onKeyDown(e) {
      if (!items.length) return false
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setSel((cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
      else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) choose(items[cur])
      else if (e.key === 'Escape') { setClosedFor(text); e.stopPropagation() }
      else return false
      e.preventDefault()
      return true
    },
    // Enter on a whole command runs it instead of sending. true = ran (clear the box), 'keep' = show the problem, false = send normally.
    submit(t) {
      if (!serverId || !t.trim().startsWith('/')) return false
      if (!registry.get()[serverId]) { loadCommands(serverId); toast('Loading commands… press Enter again in a moment.'); return 'keep' }
      const c = findCommand(t.trim(), list)
      if (!c) return false
      const r = parseCommand(t, c)
      if (r.error) { toast(r.error); return 'keep' }
      runCommand(channelId, c, r.options)
      return true
    },
    popup: (items.length > 0 || cmd) && (
      <div className="emoji-ac slash-ac pop" role="listbox" aria-label="Slash commands">
        {items.length > 0 ? <>
          <h5>Commands</h5>
          {items.map((c, i) => (
            <button key={c.install_id + c.name} role="option" aria-selected={i === cur} className={i === cur ? 'on' : ''}
              onMouseDown={ev => ev.preventDefault()} onMouseEnter={() => setSel(i)} onClick={() => choose(c)}>
              <span className="ac-ico"><Icon name={c.icon || 'sparkle'} size={16} /></span>
              <span className="slash-name">/{c.name}{c.options?.map(o => <span key={o.name} className={`slash-opt${o.required ? ' req' : ''}`}>{optionLabel(o)}</span>)}</span>
              <span className="muted slash-desc">{c.description}</span>
              <span className="slash-plugin">{c.plugin}</span>
            </button>
          ))}
        </> : <div className="slash-hint">
          <div><b>/{cmd.name}</b> {cmd.options?.map(o => <span key={o.name} className={`slash-opt${o.required ? ' req' : ''}${o.name === next ? ' next' : ''}`}>{optionLabel(o)}</span>)}
            <span className="slash-plugin">{cmd.plugin}</span></div>
          {cmd.description && <div className="muted small">{cmd.description}</div>}
          {cmd.options?.find(o => o.name === next)?.description && <div className="small">{next}: {cmd.options.find(o => o.name === next).description}</div>}
          <div className="muted small">{parsed?.error && !next ? parsed.error : next ? 'Type it, then press Enter.' : 'Press Enter to run it.'}</div>
        </div>}
      </div>
    ),
  }
}

// Ephemeral replies at the bottom of a room, under the messages.
export function Ephemerals({ channelId, me }) {
  const all = ephemerals.use()
  const mine = all.filter(e => e.channelId === channelId)
  if (!mine.length) return null
  return mine.map(e => (
    <div key={e.id} className="msg head eph" role="status">
      <div className="msg-row">
        <div className="msg-gutter"><Avatar id={e.bot_user_id} size={42} talk={!!e.pending} /></div>
        <div className="msg-body">
          <div className="msg-meta">
            <Name id={e.bot_user_id} />
            <span className="eph-tag"><Icon name="eye-off" size={13} /> Only you can see this</span>
            <button className="eph-x" onClick={() => drop(e.id)}>Dismiss</button>
          </div>
          <div className="ix-line small"><Icon name="sparkle" size={13} /> You used <code>/{e.command}</code></div>
          {e.pending ? <div className="msg-text muted eph-wait">{e.plugin} is thinking<span className="dots" /></div>
            : e.error ? <div className="msg-text eph-err">{e.error}</div>
            : <>
              {e.content && <div className="msg-text"><Markdown text={e.content} me={me} /></div>}
              <Embeds list={e.embeds} me={me} />
            </>}
        </div>
      </div>
    </div>
  ))
}
