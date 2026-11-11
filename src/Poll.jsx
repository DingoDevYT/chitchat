import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { createStore, ensureProfiles, profiles, toast } from './lib/store'
import { DURATIONS, MAX_ANSWERS, applyVote, pollArgs, tally } from './lib/polls'
import { Stamp } from './Markdown'
import Modal from './Modal'
import { CheckIcon, CloseIcon, PlusIcon, PollIcon } from './icons'

// message id -> { ...poll, votes: [{ user_id, answer }] }, or null when that message has no poll.
// Survives channel switches; Chat feeds it live votes (onVote) from its realtime channel.
export const polls = createStore({})
const want = new Set()
let flushT
function request(id) {
  if (id in polls.get() || want.has(id)) return
  want.add(id)
  clearTimeout(flushT)
  flushT = setTimeout(async () => { // one query for every poll that mounted in the same moment
    const ids = [...want]
    want.clear()
    const { data, error } = await supabase.from('polls').select('*, poll_votes(user_id, answer)').in('message_id', ids)
    if (error) return
    ensureProfiles(data.flatMap(p => p.poll_votes.map(v => v.user_id)))
    polls.set(s => {
      const n = { ...s }
      for (const id of ids) n[id] = null
      for (const { poll_votes, ...p } of data) n[p.message_id] = { ...p, votes: poll_votes }
      return n
    })
  }, 30)
}

export function onVote(v, on) {
  const p = Object.values(polls.get()).find(x => x?.id === v.poll_id)
  if (!p) return
  if (on) ensureProfiles([v.user_id])
  polls.set(s => ({ ...s, [p.message_id]: { ...s[p.message_id], votes: applyVote(s[p.message_id].votes, v, on) } }))
}

const setVotes = (mid, f) => polls.set(s => ({ ...s, [mid]: { ...s[mid], votes: f(s[mid].votes) } }))
async function vote(p, i, me) {
  const before = p.votes, mine = before.filter(v => v.user_id === me)
  const undo = error => { setVotes(p.message_id, () => before); toast(error.message.includes('row-level') ? 'This poll has closed.' : error.message) }
  if (mine.some(v => v.answer === i)) {
    setVotes(p.message_id, vs => vs.filter(v => !(v.user_id === me && v.answer === i)))
    const { error } = await supabase.from('poll_votes').delete().match({ poll_id: p.id, user_id: me, answer: i })
    return error && undo(error)
  }
  // single choice: picking another answer moves your vote
  setVotes(p.message_id, vs => [...vs.filter(v => p.allow_multiple || v.user_id !== me), { user_id: me, answer: i }])
  if (!p.allow_multiple && mine.length) {
    const { error } = await supabase.from('poll_votes').delete().match({ poll_id: p.id, user_id: me })
    if (error) return undo(error)
  }
  const { error } = await supabase.from('poll_votes').insert({ poll_id: p.id, answer: i })
  if (error) undo(error)
}

const nameOf = id => { const p = profiles.get()[id]; return p?.display_name || p?.username || 'someone' }

export function PollCard({ messageId, me }) {
  const p = polls.use(s => s[messageId])
  profiles.use() // voter names fill in as profiles load
  const [, rerender] = useState(0)
  const [open, setOpen] = useState(null) // answer whose voters are listed (tap)
  useEffect(() => { request(messageId) }, [messageId])
  const closesAt = p ? Date.parse(p.closes_at) : 0
  useEffect(() => { // flip to "closed" right on time
    const left = closesAt - Date.now()
    if (!p || left <= 0) return
    const t = setTimeout(() => rerender(x => x + 1), Math.min(left + 50, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [closesAt]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null
  const closed = Date.now() >= closesAt
  const { total, rows } = tally(p.answers, p.votes, me)
  return (
    <div className={`poll${closed ? ' closed' : ''}`} role="group" aria-label={`Poll: ${p.question}`}>
      <div className="poll-q"><PollIcon size={16} /> <b>{p.question}</b></div>
      <div className="poll-hint muted small">{closed ? 'Final results' : p.allow_multiple ? 'Pick one or more' : 'Pick one'}</div>
      <div className="poll-answers">
        {rows.map((r, i) => (
          <div key={i} className={`poll-row${r.mine ? ' mine' : ''}${closed && r.top ? ' top' : ''}`}>
            <button className="poll-opt" disabled={closed} aria-pressed={r.mine} onClick={() => vote(p, i, me)}
              title={r.who.length ? r.who.map(nameOf).join(', ') : undefined}>
              <span className="poll-fill" style={{ width: r.pct + '%' }} />
              <span className="poll-check" aria-hidden="true">{r.mine && <CheckIcon size={14} />}</span>
              <span className="poll-text">{r.text}</span>
              <span className="poll-pct">{r.pct}%</span>
            </button>
            <button className="poll-count" onClick={() => setOpen(o => o === i ? null : i)} disabled={!r.count}
              aria-expanded={open === i} aria-label={`${r.count} ${r.count === 1 ? 'vote' : 'votes'} for ${r.text}, show who`}>{r.count}</button>
            {open === i && r.count > 0 && <div className="poll-voters small muted">{r.who.map(nameOf).join(', ')}</div>}
          </div>
        ))}
      </div>
      <div className="poll-foot muted small">
        {total} {total === 1 ? 'person' : 'people'} voted · {closed ? 'Closed ' : 'Closes '}<Stamp v={closesAt / 1000} f="R" />
      </div>
    </div>
  )
}

export function PollCreator({ onCreate, onClose }) {
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState(['', ''])
  const [hours, setHours] = useState(24)
  const [multi, setMulti] = useState(false)
  const [busy, setBusy] = useState(false)
  const edit = (i, v) => setAnswers(a => a.map((x, j) => j === i ? v : x))
  async function submit(e) {
    e.preventDefault()
    const args = pollArgs({ question, answers, multi, hours })
    if (args.error) return toast(args.error)
    setBusy(true)
    const ok = await onCreate(args)
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal title="Create a poll" onClose={onClose}>
      <form className="col poll-form" onSubmit={submit}>
        <label>Question<input autoFocus value={question} onChange={e => setQuestion(e.target.value)} maxLength={300} placeholder="What should we play tonight?" /></label>
        <fieldset className="poll-form-answers">
          <legend>Answers</legend>
          {answers.map((a, i) => (
            <div key={i} className="row poll-form-row">
              <input value={a} onChange={e => edit(i, e.target.value)} maxLength={55} placeholder={`Answer ${i + 1}`} aria-label={`Answer ${i + 1}`} />
              {answers.length > 2 && <button type="button" className="icon-btn" onClick={() => setAnswers(x => x.filter((_, j) => j !== i))} aria-label={`Remove answer ${i + 1}`}><CloseIcon size={16} /></button>}
            </div>
          ))}
          {answers.length < MAX_ANSWERS && <button type="button" className="btn ghost small" onClick={() => setAnswers(a => [...a, ''])}><PlusIcon size={15} /> Add answer</button>}
        </fieldset>
        <div className="row poll-form-opts">
          <label className="poll-dur">Runs for
            <select value={hours} onChange={e => setHours(+e.target.value)}>{DURATIONS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}</select>
          </label>
          <label className="poll-multi"><input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} /> Allow more than one answer</label>
        </div>
        <button className="btn primary" disabled={busy}>Post poll</button>
      </form>
    </Modal>
  )
}
