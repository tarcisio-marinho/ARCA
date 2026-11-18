import { parse } from 'node-html-parser'
import { config } from './config.ts'

export type Book = {
  id: string
  name: string // nome estável (ex: wikipedia_pt_all_nopic)
  path: string // segmento usado em /content/<path>/
  title: string
  description: string
  language: string
  category: string
  tags: string
  articleCount: number
  size: number
  icon?: string
}

let cache: { at: number; books: Book[] } | null = null

function tag(xml: string, name: string) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? decode(m[1].trim()) : ''
}
function decode(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Catálogo OPDS do kiwix-serve → lista de livros. Cache de 30s (o acervo muda quando um ZIM novo chega). */
export async function listBooks(force = false): Promise<Book[]> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.books
  const r = await fetch(`${config.kiwixUrl}/catalog/v2/entries?count=1000`, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`kiwix HTTP ${r.status}`)
  const xml = await r.text()
  const books: Book[] = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]
    const content = e.match(/<link type="text\/html" href="[^"]*\/content\/([^"]+)"/)
    const icon = e.match(/<link rel="http:\/\/opds-spec\.org\/image\/thumbnail"\s+href="([^"]+)"/)
    const tags = tag(e, 'tags')
    books.push({
      id: tag(e, 'id').replace('urn:uuid:', ''),
      name: tag(e, 'name'),
      path: content ? decodeURIComponent(content[1]) : tag(e, 'name'),
      title: tag(e, 'title'),
      description: tag(e, 'summary'),
      language: tag(e, 'language'),
      category: tag(e, 'category') || (tags.match(/_category:([^;]+)/)?.[1] ?? 'other'),
      tags,
      articleCount: Number(tag(e, 'articleCount') || 0),
      size: 0, // preenchido pela rota a partir do arquivo local
      icon: icon ? icon[1].replace(/^.*\/catalog\//, '/kiwix/catalog/') : undefined,
    })
  }
  cache = { at: Date.now(), books }
  return books
}

export type SearchHit = { book: string; bookTitle: string; title: string; path: string; snippet: string; lang: string }

/** Busca full-text em um livro (kiwix-serve /search, formato XML/RSS). */
async function searchBook(book: Book, pattern: string, limit: number): Promise<SearchHit[]> {
  const url = `${config.kiwixUrl}/search?books.name=${encodeURIComponent(book.path)}&pattern=${encodeURIComponent(
    pattern
  )}&format=xml&pageLength=${limit}`
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) return []
  const xml = await r.text()
  const hits: SearchHit[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1]
    const link = tag(it, 'link')
    const path = link.replace(/^.*?\/content\//, '')
    hits.push({
      book: book.path, // segmento de URL (/content/<path>/...)
      bookTitle: book.title,
      title: tag(it, 'title'),
      path: decodeURIComponent(path),
      snippet: tag(it, 'description').replace(/<[^>]+>/g, '').slice(0, 400),
      lang: book.language,
    })
  }
  return hits
}

/**
 * Busca em vários livros em paralelo. O kiwix só busca multi-livro se forem do mesmo idioma,
 * então disparamos por livro e intercalamos os resultados (round-robin preserva relevância de cada um).
 */
export async function searchAll(
  pattern: string,
  opts: { books?: string[]; langs?: string[]; perBook?: number; limit?: number } = {}
): Promise<SearchHit[]> {
  let books = await listBooks()
  if (opts.books?.length) books = books.filter((b) => opts.books!.includes(b.name))
  if (opts.langs?.length) books = books.filter((b) => opts.langs!.some((l) => b.language.includes(l)))
  books = books.filter((b) => b.tags.includes('_ftindex:yes') || !b.tags.includes('_ftindex'))
  const per = opts.perBook ?? 3
  const results = await Promise.all(books.map((b) => searchBook(b, pattern, per).catch(() => [])))
  const merged: SearchHit[] = []
  for (let i = 0; i < per; i++) for (const list of results) if (list[i]) merged.push(list[i])
  return merged.slice(0, opts.limit ?? 30)
}

/**
 * Lê um artigo e devolve texto limpo. Se houver `focus`, prioriza os parágrafos que mencionam os termos
 * (cabe mais informação útil na janela de contexto da IA).
 */
export async function readArticle(bookPath: string, articlePath: string, opts: { focus?: string; maxChars?: number } = {}) {
  const url = `${config.kiwixUrl}/content/${encodeURIComponent(bookPath)}/${articlePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error(`artigo não encontrado (${r.status})`)
  const html = await r.text()
  const root = parse(html)
  root.querySelectorAll('script,style,noscript,nav,footer,header,.navbox,.reflist,.references,sup.reference,.mw-editsection,table.infobox').forEach((n) => n.remove())
  const title = root.querySelector('title')?.text.trim() ?? articlePath
  const blocks: string[] = []
  for (const el of root.querySelectorAll('h1,h2,h3,h4,p,li,pre,td,dd')) {
    const t = el.text.replace(/\s+/g, ' ').trim()
    if (t.length < 2) continue
    if (/^H\d$/.test(el.tagName)) blocks.push(`\n## ${t}`)
    else blocks.push(el.tagName === 'LI' ? `- ${t}` : t)
  }
  // dedupe (li dentro de td etc.)
  const seen = new Set<string>()
  const clean = blocks.filter((b) => (seen.has(b) ? false : (seen.add(b), true)))
  const max = opts.maxChars ?? 6000
  let text = clean.join('\n')
  if (text.length > max && opts.focus) {
    const terms = opts.focus
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3)
    const scored = clean.map((b, i) => ({ b, i, s: terms.reduce((acc, t) => acc + (b.toLowerCase().includes(t) ? 1 : 0), 0) }))
    const keep = new Set<number>()
    let used = 0
    // início do artigo (resumo) sempre entra
    for (const x of scored) {
      if (used > max * 0.3) break
      keep.add(x.i)
      used += x.b.length
    }
    for (const x of [...scored].sort((a, b) => b.s - a.s)) {
      if (x.s === 0 || used > max) break
      if (!keep.has(x.i)) {
        keep.add(x.i)
        used += x.b.length
      }
    }
    text = clean.filter((_, i) => keep.has(i)).join('\n')
  }
  if (text.length > max) text = text.slice(0, max) + '\n[…truncado]'
  return { title, text, url: `/kiwix/content/${bookPath}/${articlePath}` }
}
