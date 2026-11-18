// Busca literal ("Ctrl+F") em toda a base local: guias, PDFs, uploads e notas.
// Ignora acentos, maiúsculas e quebras de linha (PDFs quebram frases no meio). Tudo em memória:
// a base inteira tem poucos MB de texto, então varrer é mais rápido e previsível que índice.
import { one, q } from './db.ts'

type Norm = { text: string; map: Int32Array } // map[i] = posição no texto original do char normalizado i

/** Normaliza preservando o mapeamento para o original (para recortar trechos e destacar). */
export function normalize(src: string): Norm {
  const out: string[] = []
  const map: number[] = []
  let lastSpace = true
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (/\s/.test(c)) {
      if (!lastSpace) {
        out.push(' ')
        map.push(i)
        lastSpace = true
      }
      continue
    }
    const n = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    for (const ch of n) {
      out.push(ch)
      map.push(i)
    }
    lastSpace = false
  }
  return { text: out.join(''), map: Int32Array.from(map) }
}
export const normQuery = (s: string) => normalize(s.trim()).text.trim()

type Entry = {
  id: number
  title: string
  category: string
  sourceType: string
  sourceRef: string
  content: string
  norm: Norm
  normTitle: string
  pageOffsets: number[] // PDF: início de cada "[página N]" no texto original
  headings: { pos: number; title: string }[] // Markdown: início de cada seção no texto limpo
}

/** Markdown -> texto corrido (sem **, ##, tabelas, checkboxes), guardando onde começa cada seção. */
function plainMarkdown(md: string) {
  const out: string[] = []
  const headings: { pos: number; title: string }[] = []
  let len = 0
  let parent = ''
  const emit = (line: string) => {
    out.push(line)
    len += line.length + 1
  }
  for (const raw of md.split('\n')) {
    const h = raw.match(/^(#{1,6})\s+(.*)/)
    const inline = (t: string) =>
      t
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\*\*|__|`/g, '')
        .replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|$|[.,;:!?)])/g, '$1$2')
    if (h) {
      const title = inline(h[2]).trim()
      if (h[1].length <= 2) parent = title
      headings.push({ pos: len, title: h[1].length >= 3 && parent ? `${parent} › ${title}` : title })
      emit(title)
      continue
    }
    if (/^\s*\|?\s*:?-{3,}/.test(raw)) continue // separador de tabela
    let line = raw
      .replace(/^\s*>\s?/, '')
      .replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/, '$1☐ ')
      .replace(/^(\s*)[-*+]\s+/, '$1• ')
    if (/^\s*\|/.test(line)) line = line.replace(/^\s*\|\s*|\s*\|\s*$/g, '').replace(/\s*\|\s*/g, ' · ')
    emit(inline(line))
  }
  return { text: out.join('\n'), headings }
}

let cache: { key: string; entries: Entry[] } | null = null

async function loadDocs(): Promise<Entry[]> {
  const sig = await one<{ k: string }>(`SELECT count(*)::text || ':' || coalesce(max(updated_at)::text,'') || ':' || coalesce(sum(id)::text,'') k FROM docs`)
  if (cache && cache.key === sig?.k) return cache.entries
  const rows = await q<{ id: number; title: string; category: string; source_type: string; source_ref: string; content: string }>(
    'SELECT id, title, category, source_type, source_ref, content FROM docs'
  )
  const entries = rows.map((r) => {
    const pageOffsets: number[] = []
    const isPdf = /\.pdf$/i.test(r.source_ref)
    if (isPdf) for (const m of r.content.matchAll(/\[página (\d+)\]/g)) pageOffsets[Number(m[1])] = m.index!
    const plain = isPdf ? { text: r.content, headings: [] } : plainMarkdown(r.content)
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      sourceType: r.source_type,
      sourceRef: r.source_ref,
      content: plain.text,
      norm: normalize(plain.text),
      normTitle: normQuery(r.title),
      pageOffsets,
      headings: plain.headings,
    }
  })
  cache = { key: sig?.k ?? '', entries }
  return entries
}

export type Snippet = { text: string; hl: [number, number][]; page?: number; heading?: string }
export type FindHit = {
  kind: 'guide' | 'pdf' | 'upload' | 'note'
  id: number
  title: string
  category: string
  sourceRef?: string
  count: number
  titleMatch: boolean
  snippets: Snippet[]
}

function positions(hay: string, needle: string, max = 5000): number[] {
  const out: number[] = []
  let i = hay.indexOf(needle)
  while (i >= 0 && out.length < max) {
    out.push(i)
    i = hay.indexOf(needle, i + needle.length)
  }
  return out
}

const CTX = 110

/** Recorta o trecho original em volta de uma ocorrência e marca todas as ocorrências dentro dele. */
function snippetAt(content: string, n: Norm, terms: string[], pos: number, len: number): Snippet {
  const oStart = n.map[pos]
  const oEnd = (n.map[pos + len - 1] ?? oStart) + 1
  let a = Math.max(0, oStart - CTX)
  let b = Math.min(content.length, oEnd + CTX)
  // não corta palavra no meio
  while (a > 0 && /\S/.test(content[a - 1]) && oStart - a < CTX + 20) a--
  while (b < content.length && /\S/.test(content[b]) && b - oEnd < CTX + 20) b++
  const raw = content.slice(a, b)
  // colapsa espaços mantendo offsets de destaque coerentes
  const clean: string[] = []
  const back: number[] = [] // índice no raw -> índice no clean
  let sp = false
  for (let i = 0; i < raw.length; i++) {
    back[i] = clean.length
    if (/\s/.test(raw[i])) {
      if (!sp) clean.push(' ')
      sp = true
    } else {
      clean.push(raw[i])
      sp = false
    }
  }
  back[raw.length] = clean.length
  // destaques: todas as ocorrências dos termos dentro do recorte
  const sub = normalize(raw)
  const hl: [number, number][] = []
  for (const t of terms)
    for (const p of positions(sub.text, t, 50)) {
      const s = sub.map[p]
      const e = sub.map[p + t.length - 1] + 1
      hl.push([back[s], back[e]])
    }
  hl.sort((x, y) => x[0] - y[0])
  const joined = clean.join('')
  const lead = joined.length - joined.trimStart().length
  const shift = (a > 0 ? 1 : 0) - lead
  return {
    text: (a > 0 ? '…' : '') + joined.trim() + (b < content.length ? '…' : ''),
    hl: hl.map(([s, e]) => [s + shift, e + shift] as [number, number]),
  }
}

function pageOf(e: Entry, origPos: number): number | undefined {
  let page: number | undefined
  e.pageOffsets.forEach((off, p) => {
    if (off !== undefined && off <= origPos) page = p
  })
  return page
}

function headingOf(e: Entry, origPos: number): string | undefined {
  let t: string | undefined
  for (const h of e.headings) {
    if (h.pos > origPos) break
    t = h.title
  }
  return t
}

export async function findEverywhere(query: string, opts: { maxDocs?: number; perDoc?: number } = {}) {
  const t0 = Date.now()
  const phrase = normQuery(query)
  if (phrase.length < 2) return { query, mode: 'phrase' as const, total: 0, docs: 0, hits: [] as FindHit[], ms: 0 }
  const perDoc = opts.perDoc ?? 4
  const entries = await loadDocs()

  // notas: poucas, sempre frescas
  const notes = await q<{ id: number; title: string; body: string }>('SELECT id, title, body FROM notes')
  const all = [
    ...entries.map((e) => ({ e, kind: e.sourceType as FindHit['kind'] })),
    ...notes.map((n) => {
      const content = `${n.title}\n\n${n.body}`
      return {
        e: { id: n.id, title: n.title, category: 'Diário & notas', sourceType: 'note', sourceRef: '', content, norm: normalize(content), normTitle: normQuery(n.title), pageOffsets: [], headings: [] } as Entry,
        kind: 'note' as const,
      }
    }),
  ]

  const run = (terms: string[], requireAll: boolean) => {
    const hits: FindHit[] = []
    for (const { e, kind } of all) {
      const perTerm = terms.map((t) => positions(e.norm.text, t))
      if (requireAll ? perTerm.some((p) => !p.length) : !perTerm[0].length) continue
      const count = perTerm.reduce((s, p) => s + p.length, 0)
      // trechos: espalha pelas ocorrências do 1º termo, sem repetir regiões próximas
      const picks: number[] = []
      for (const p of perTerm[0]) {
        if (picks.length >= perDoc) break
        if (!picks.length || p - picks[picks.length - 1] > CTX * 2) picks.push(p)
      }
      hits.push({
        kind,
        id: e.id,
        title: e.title,
        category: e.category,
        sourceRef: e.sourceRef || undefined,
        count,
        titleMatch: terms.every((t) => e.normTitle.includes(t)),
        snippets: picks.map((p) => {
          const s = snippetAt(e.content, e.norm, terms, p, terms[0].length)
          const orig = e.norm.map[p]
          if (!e.pageOffsets.length) s.heading = headingOf(e, orig)
          else s.page = pageOf(e, orig)
          return s
        }),
      })
    }
    return hits
  }

  let mode: 'phrase' | 'words' = 'phrase'
  let hits = run([phrase], false)
  const words = [...new Set(phrase.split(' ').filter((w) => w.length >= 2))]
  if (!hits.length && words.length > 1) {
    mode = 'words'
    hits = run(words, true)
  }

  const order: Record<string, number> = { guide: 0, note: 1, upload: 2, pdf: 3 }
  hits.sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch) || order[a.kind] - order[b.kind] || b.count - a.count)
  return {
    query,
    mode,
    total: hits.reduce((s, h) => s + h.count, 0),
    docs: hits.length,
    hits: hits.slice(0, opts.maxDocs ?? 200),
    ms: Date.now() - t0,
  }
}
