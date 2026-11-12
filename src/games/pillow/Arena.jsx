// The battle: the tug-of-war vote meter (a three-way split meter for a three-way brawl), the champions sliding in and
// shouting their battle cries in turn (squash and stretch with the clip's loudness), the pillow fight (dust cloud,
// stars, feathers, leaning towards whoever is ahead), live voting, and the winner up front with confetti while the
// losers take a tumble. A returning old champion wears a "back" tag and scores its artist half.
import { useEffect, useRef, useState } from 'react'
import { BACK, MS, cryAt, cryMs, sidesOf } from './rules.js'
import { loadCry, playCry } from './audio.js'
import { Doodle, reduced } from './Doodle.jsx'
import { ChampName, Face } from './bits.jsx'
import Icon from '../../icons/Icon'

const wall = (v, t) => (v.epoch ?? 0) + t

export function TugMeter({ va, vb, nameA, nameB, live }) {
  const total = va + vb, f = total ? va / total : 0.5
  return (
    <div className={`pcf-tug${live ? ' live' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} aria-label={`Votes: ${nameA} ${va}, ${nameB} ${vb}`}>
      <span className="pcf-tug-side a"><b>{va}</b>{nameA}</span>
      <div className="pcf-tug-track">
        <i className="pcf-tug-fill a" style={{ width: `${f * 100}%` }} />
        <i className="pcf-tug-fill b" style={{ width: `${(1 - f) * 100}%` }} />
        <svg className="pcf-tug-rope" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0 10 Q25 4 50 10 T100 10 T150 10 T200 10 T250 10 T300 10 T350 10 T400 10" /></svg>
        <span className="pcf-tug-knot" style={{ left: `${f * 100}%` }} aria-hidden="true" />
      </div>
      <span className="pcf-tug-side b">{nameB}<b>{vb}</b></span>
    </div>
  )
}

// Three champions: one bar split three ways (equal thirds before anyone votes), names and counts underneath.
export function SplitMeter({ n, names, live }) {
  const sides = ['a', 'b', 'c'], total = n.a + n.b + n.c
  return (
    <div className={`pcf-split${live ? ' live' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.max(n.a, n.b, n.c)}
      aria-label={`Votes: ${sides.map(s => `${names[s]} ${n[s]}`).join(', ')}`}>
      <div className="pcf-split-track">{sides.map(s => <i key={s} className={`pcf-split-fill ${s}`} style={{ width: `${(total ? n[s] / total : 1 / 3) * 100}%` }} />)}</div>
      <div className="pcf-split-names">{sides.map(s => <span key={s} className={`pcf-split-side ${s}`}><b>{n[s]}</b><span>{names[s]}</span></span>)}</div>
    </div>
  )
}

// Feathers, stars and puffs for the fight cloud (fixed layout, animated in CSS).
const BITS = Array.from({ length: 14 }, (_, i) => ({ k: i % 3, a: (i * 137) % 360, d: 40 + ((i * 53) % 60), t: (i * 0.23) % 1.6 }))
function FightCloud({ lean }) {
  return (
    <div className="pcf-fight" style={{ '--lean': lean }} aria-hidden="true">
      <svg className="pcf-cloud" viewBox="0 0 240 170">
        <path d="M40 120c-26 0-30-38-6-44-6-30 30-44 48-26 8-26 52-30 62-4 22-16 56 0 50 28 28 4 26 46 0 46-4 22-40 26-52 10-14 18-50 16-58-2-18 10-44 4-44-8z" fill="#f4e7cf" stroke="#4a3b32" strokeWidth="4" strokeLinejoin="round" />
        <path d="M70 70q10-12 22-4 M150 58q12-8 20 4 M100 130q14 8 28 0" fill="none" stroke="#c9b89c" strokeWidth="4" strokeLinecap="round" />
        <g className="pcf-pillow p1"><rect x="20" y="40" width="58" height="38" rx="14" fill="#fffdf8" stroke="#4a3b32" strokeWidth="4" /><path d="M30 52q19 8 38 0" stroke="#f2a7c3" strokeWidth="4" fill="none" /></g>
        <g className="pcf-pillow p2"><rect x="162" y="96" width="58" height="38" rx="14" fill="#fffdf8" stroke="#4a3b32" strokeWidth="4" /><path d="M172 108q19 8 38 0" stroke="#9fd0ea" strokeWidth="4" fill="none" /></g>
        <text x="120" y="98" textAnchor="middle" className="pcf-bonk">BONK!</text>
      </svg>
      {BITS.map((b, i) => <i key={i} className={`pcf-bit k${b.k}`} style={{ '--a': `${b.a}deg`, '--dist': `${b.d}px`, '--t': `${b.t}s` }} />)}
    </div>
  )
}

function Confetti() {
  return <div className="pcf-confetti" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} style={{ '--i': i, '--x': `${(i * 37) % 100}%`, '--c': ['#ff9f6b', '#f6d37a', '#8fc59a', '#9fd0ea', '#f2a7c3', '#b597e0'][i % 6] }} />)}</div>
}

function Fighter({ side, champ, owner, roster, nm, speaking, ampRef, vote, onVote, canVote, mine, state, replayKey, back }) {
  const name = <ChampName champ={champ} owner={owner} nm={nm} />
  return (
    <div className={`pcf-fighter ${side} ${state}${speaking ? ' talking' : ''}${mine ? ' mine' : ''}${back ? ' back' : ''}`}>
      {speaking && (champ.cry?.text && !champ.cry?.ext
        ? <div className="pcf-bubble words">{champ.cry.text}</div>
        : <div className="pcf-bubble" aria-hidden="true"><svg viewBox="0 0 60 24"><path d="M4 12q6-10 12 0t12 0 12 0 12 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></div>)}
      <button className={`pcf-card${vote ? ' voted' : ''}`} ref={ampRef} onClick={canVote ? onVote : undefined} disabled={!canVote} aria-pressed={canVote ? vote : undefined}
        aria-label={canVote ? `Vote for ${champ.name || 'this champion'}` : undefined}>
        <span className="pcf-card-art"><Doodle key={replayKey} art={champ.art} replay dur={1700} delay={{ a: 300, b: 700, c: 1100 }[side]} label={champ.name || 'A champion'} /></span>
        <span className="pcf-card-name">{name}</span>
        <span className="pcf-card-by">{champ.house ? <><HouseIcon /> House champion</> : <><Face p={roster(owner)} size={20} /> {nm(owner)}{back ? ` · ½ pts` : ''}</>}</span>
        {back && <span className="pcf-belt pcf-back" title={`An old champion from round ${champ.round}, back for one bout`}>Back from round {champ.round}</span>}
        {!back && champ.streak > 0 && state !== 'won' && <span className="pcf-belt" title="Defending the title"><Icon name="crown" size={14} /> {champ.streak} {champ.streak === 1 ? 'win' : 'wins'}</span>}
        {vote && <span className="pcf-check"><Icon name="check" size={18} /></span>}
      </button>
    </div>
  )
}
export const HouseIcon = () => <svg className="pcf-house" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="12" rx="5" fill="#fffdf8" stroke="currentColor" strokeWidth="2" /><path d="M7 11q5 3 10 0" stroke="#f2a7c3" strokeWidth="2" fill="none" /></svg>

export default function Arena({ v, gameId, me, roster, nm, vote, myVote, now }) {
  const b = v.bouts[v.bi], sides = sidesOf(b), three = sides.length === 3
  const C = Object.fromEntries(sides.map(s => [s, v.champs[b[s]]]))
  const stage = v.stage, key = `${v.round}:${v.bi}`
  const [speaker, setSpeaker] = useState(null)
  const amp = { a: useRef(null), b: useRef(null), c: useRef(null) }
  const canVote = b.voters.includes(me) && (stage === 'lines' || stage === 'vote')
  const iFight = sides.some(s => C[s].owner === me)
  const votes = { ...v.votes, ...(myVote !== undefined && canVote ? { [me]: myVote } : {}) }
  if (myVote === null) delete votes[me]
  const n = Object.fromEntries(sides.map(s => [s, b.res ? b.res[`v${s}`] : b.voters.filter(x => votes[x] === s).length]))
  const total = sides.reduce((t, s) => t + n[s], 0)
  // Which way the fight leans: towards A (left) or the last champion (right); in a three-way B stands in the middle.
  const last = sides.at(-1), lean = total ? (n.a - n[last]) / total : 0
  const won = b.res?.w
  const nameOf = s => C[s].name || (C[s].house ? 'House' : nm(C[s].owner))

  // Fetch the clips as soon as the bout appears.
  useEffect(() => { for (const s of sides) loadCry(gameId, C[s]) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // The battle cries, on the shared clock: each champion in turn after a pause (cryAt); the winner again on the win
  // stage (after the same pause).
  useEffect(() => {
    const at = cryAt(v, b)
    const plan = stage === 'lines'
      ? sides.map(s => [s, C[s], at[s]])
      : stage === 'win' && won ? [[won, C[won], 900 + MS.pause]] : []
    const stops = [], timers = []
    const t0 = wall(v, v.from)
    for (const [side, champ, off] of plan) {
      const wait = t0 + off - Date.now()
      if (wait < -800) continue // joined late: skip lines already said
      timers.push(setTimeout(() => {
        setSpeaker(side)
        const el = amp[side].current
        stops.push(playCry(gameId, champ, a => el?.style.setProperty('--amp', a.toFixed(3))))
        timers.push(setTimeout(() => { setSpeaker(s => (s === side ? null : s)); stops.forEach(f => f()) }, cryMs(champ.cry) + 150))
      }, Math.max(0, wait)))
    }
    return () => { timers.forEach(clearTimeout); stops.forEach(f => f()); setSpeaker(null) }
  }, [key, stage]) // eslint-disable-line react-hooks/exhaustive-deps

  const left = Math.max(0, Math.ceil((wall(v, v.until) - now) / 1000))
  const head = stage === 'lines' ? (three ? 'Three-way battle cries!' : 'Battle cries!') : stage === 'vote' ? (canVote ? 'Tap who wins the pillow fight' : iFight ? 'Pillow fight! The crowd is voting' : 'Pillow fight!') : won ? `${C[won].name || 'The champion'} wins!` : ''
  const stateOf = side => stage === 'win' ? (won === side ? 'won' : 'lost') : stage === 'lines' ? 'enter' : 'fight'
  const roundPts = b.res ? b.res.pts : null
  const winnerChamp = won ? C[won] : null
  const motion = !reduced()
  const mineSide = sides.find(s => C[s].owner === me)
  const tieText = () => {
    if (!b.res.tie) return ''
    if (winnerChamp.streak > 1) return ' · a tie keeps the title'
    return b.back ? ' · a tie goes to the new champion' : ' · a tie, settled by a coin toss'
  }
  const after = won === b.back ? ' · takes a bow and heads back to the bench' : b.res?.streak > 1 ? ` · ${b.res.streak} wins in a row!` : ' · defends the title next round'
  const hint = canVote
    ? (votes[me] ? 'You can change your vote until the bell.' : mineSide ? 'Nobody else is watching, so vote for one of your rivals.' : three ? 'Everyone not in this brawl picks one of the three.' : 'Everyone not in this bout votes.')
    : iFight ? "You're in this one. Cheer your champion on!" : b.voters.includes(me) ? 'Voting opens in a moment.' : 'Watching from the crowd.'
  const fighter = s => (
    <Fighter key={s} side={s} champ={C[s]} owner={C[s].owner} roster={roster} nm={nm} speaking={speaker === s} ampRef={amp[s]} vote={votes[me] === s}
      onVote={() => vote(votes[me] === s ? null : s)} canVote={canVote && C[s].owner !== me} mine={C[s].owner === me} state={stateOf(s)} replayKey={key} back={b.back === s} />
  )

  return (
    <div className={`pcf-arena st-${stage}${three ? ' three' : ''}`} style={{ '--lean': lean }}>
      {three
        ? <SplitMeter n={n} names={{ a: nameOf('a'), b: nameOf('b'), c: nameOf('c') }} live={stage === 'vote'} />
        : <TugMeter va={n.a} vb={n.b} nameA={nameOf('a')} nameB={nameOf('b')} live={stage === 'vote'} />}
      <div className="pcf-prompt">
        <small>Round {v.round} · Bout {v.bi + 1} of {v.bouts.length}{three ? ' · Three-way brawl' : b.back ? ' · An old champion returns' : ''}{stage !== 'win' && left > 0 ? ` · ${left}s` : ''}</small>
        <b>{b.prompt}</b>
      </div>
      <div className={`pcf-ring${three ? ' three' : ''}`}>
        {fighter('a')}
        {stage === 'vote' && motion && <FightCloud lean={lean} />}
        {stage === 'vote' && !motion && <div className="pcf-vs still">VS</div>}
        {stage === 'lines' && !three && <div className="pcf-vs">VS</div>}
        {sides.slice(1).map(fighter)}
        {stage === 'win' && <Confetti />}
      </div>
      <div className="pcf-callout" aria-live="polite">
        <b>{head}</b>
        {stage === 'win' && winnerChamp && <small>
          {sides.map(s => b.res[`v${s}`]).join(' – ')}{tieText()}
          {winnerChamp.owner ? ` · ${nm(winnerChamp.owner)} +${roundPts[won]}${won === b.back ? ` (${BACK === 0.5 ? 'half' : `${Math.round(BACK * 100)}%`} for an old champion)` : ''}` : ''}
          {after}
        </small>}
        {stage !== 'win' && <small>{hint}</small>}
      </div>
    </div>
  )
}

