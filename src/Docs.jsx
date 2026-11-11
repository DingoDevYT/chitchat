import { useEffect, useMemo, useState } from 'react'
import { renderMarkdown, searchDocs } from './lib/docsmd'
import { Critter } from './Avatar'
import Icon from './icons/Icon'
import './styles/plugins.css'

// In-app docs at #/docs/<page>/<heading>: the Markdown files in docs/ (see docs/MAINTAINING.md for adding a page).
const FILES = import.meta.glob('../docs/*.md', { query: '?raw', import: 'default', eager: true })
const ORDER = ['introduction', 'quickstart', 'build-a-bot', 'concepts', 'events', 'bot-api', 'embeds', 'slash-commands',
  'security', 'best-practices', 'built-in-plugins', 'troubleshooting', 'changelog']
export const PAGES = ORDER.filter(s => FILES[`../docs/${s}.md`]).map(slug => ({ slug, ...renderMarkdown(FILES[`../docs/${slug}.md`], slug) }))

function route() {
  const [, , page, heading] = location.hash.split('/')
  return { page: PAGES.some(p => p.slug === page) ? page : PAGES[0].slug, heading: heading || null }
}

export default function Docs() {
  const [r, setR] = useState(route)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const on = () => { setR(route()); setMenu(false) }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const i = PAGES.findIndex(p => p.slug === r.page)
  const page = PAGES[i], prev = PAGES[i - 1], next = PAGES[i + 1]
  useEffect(() => {
    document.title = `${page.title} · Chitchat docs`
    const el = r.heading && document.getElementById(r.heading)
    if (el) el.scrollIntoView({ block: 'start' })
    else scrollTo(0, 0)
  }, [r, page.title])
  useEffect(() => () => { document.title = 'Chitchat' }, [])
  const hits = useMemo(() => searchDocs(PAGES, q), [q])

  // copy buttons on code blocks (the HTML comes from renderMarkdown)
  function onClick(e) {
    const b = e.target.closest('.docs-copy')
    if (!b) return
    navigator.clipboard?.writeText(b.closest('.docs-code').querySelector('code').textContent)
      .then(() => { b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy' }, 1500) }, () => { b.textContent = 'Select and copy' })
  }

  return (
    <div className="docs">
      <header className="docs-top">
        <button className="icon-btn docs-menu-btn" onClick={() => setMenu(m => !m)} aria-label="Pages" aria-expanded={menu}><Icon name="menu" /></button>
        <a href="#/docs" className="docs-brand"><Critter size={30} color="#ff9f6b" /> <span>Chitchat <b>plugin docs</b></span></a>
        <span className="spacer" />
        <a className="btn ghost small" href="#/">Back<span className="docs-hide-sm"> to Chitchat</span></a>
      </header>
      <div className="docs-wrap">
        <nav className={`docs-nav${menu ? ' open' : ''}`} aria-label="Docs pages">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the docs" aria-label="Search the docs" />
          {q.trim().length >= 2
            ? hits.length ? hits.map((h, n) => (
              <a key={n} className="docs-hit" href={`#/docs/${h.slug}${h.heading ? '/' + h.heading.id : ''}`} onClick={() => setQ('')}>
                <b>{h.heading ? h.heading.text : h.title}</b>{h.heading && <span className="muted small"> in {h.title}</span>}
                {h.snippet && <span className="muted small docs-snip">{h.snippet}</span>}
              </a>)) : <p className="muted small">Nothing found for “{q}”.</p>
            : PAGES.map(p => <a key={p.slug} href={`#/docs/${p.slug}`} className={p.slug === page.slug ? 'on' : ''} aria-current={p.slug === page.slug ? 'page' : undefined}>{p.title}</a>)}
        </nav>
        <main className="docs-main" onClick={onClick}>
          <article className="docs-article" dangerouslySetInnerHTML={{ __html: page.html }} />
          <nav className="docs-pager" aria-label="Next and previous pages">
            {prev ? <a href={`#/docs/${prev.slug}`}><span className="muted small">Previous</span><b><Icon name="chevron-left" size={16} /> {prev.title}</b></a> : <span />}
            {next && <a href={`#/docs/${next.slug}`} className="next"><span className="muted small">Next</span><b>{next.title} <Icon name="chevron-right" size={16} /></b></a>}
          </nav>
        </main>
        {page.toc.some(h => h.level === 2) && <aside className="docs-toc" aria-label="On this page">
          <span className="muted small">On this page</span>
          {page.toc.filter(h => h.level === 2).map(h => <a key={h.id} href={`#/docs/${page.slug}/${h.id}`}>{h.text}</a>)}
        </aside>}
      </div>
    </div>
  )
}
