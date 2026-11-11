// Poll helpers (tested in polls.test.js). The database enforces all of this too (030_messaging_plus.sql).
export const DURATIONS = [[1, '1 hour'], [4, '4 hours'], [8, '8 hours'], [24, '24 hours'], [72, '3 days'], [168, '1 week']]
export const MAX_ANSWERS = 10

// Per answer: count, % of people who voted, who, and whether you're one of them.
export function tally(answers, votes, me) {
  const total = new Set(votes.map(v => v.user_id)).size
  const top = Math.max(0, ...answers.map((_, i) => votes.filter(v => v.answer === i).length))
  return {
    total,
    rows: answers.map((text, i) => {
      const who = votes.filter(v => v.answer === i).map(v => v.user_id)
      return { text, count: who.length, pct: total ? Math.round((who.length / total) * 100) : 0, who, mine: who.includes(me), top: top > 0 && who.length === top }
    }),
  }
}

const same = (a, b) => a.user_id === b.user_id && a.answer === b.answer
export const applyVote = (votes, v, on) => on ? (votes.some(x => same(x, v)) ? votes : [...votes, { user_id: v.user_id, answer: v.answer }]) : votes.filter(x => !same(x, v))

// The poll form → create_poll arguments, or { error }.
export function pollArgs({ question, answers, multi, hours }) {
  const q = question.trim(), a = answers.map(s => s.trim()).filter(Boolean)
  if (!q) return { error: 'Ask a question first.' }
  if (q.length > 300) return { error: 'Questions can be up to 300 characters.' }
  if (a.length < 2) return { error: 'Add at least two answers.' }
  if (a.length > MAX_ANSWERS) return { error: `Up to ${MAX_ANSWERS} answers.` }
  if (a.some(s => s.length > 55)) return { error: 'Answers can be up to 55 characters.' }
  if (new Set(a.map(s => s.toLowerCase())).size < a.length) return { error: 'Two answers are the same.' }
  if (!DURATIONS.some(([h]) => h === hours)) return { error: 'Pick how long it runs.' }
  return { question: q, answers: a, allow_multiple: !!multi, duration_h: hours }
}
