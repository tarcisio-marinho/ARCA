import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.ts'
import { one, pool, q } from './db.ts'
import { embed } from './llm.ts'

const CHUNK = 1100
const OVERLAP = 150

export type Chunk = { heading: string | null; text: string }

// HFS+ (HD externo) devolve nomes acentuados em NFD; APFS em NFC. Normaliza p/ o mesmo arquivo ter a mesma chave.
const nfc = (s: string) => s.normalize('NFC')

function sha(s: string | Buffer) {
  return createHash('sha256').update(s).digest('hex')
}

/** Frontmatter simples: --- \n title: X \n category: Y \n --- */
function parseFrontmatter(md: string) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/)
  const meta: Record<string, string> = {}
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
    md = md.slice(m[0].length)
  }
  return { meta, body: md }
}

function splitLong(text: string, heading: string | null, out: Chunk[]) {
  text = text.trim()
  if (!text) return
  if (text.length <= CHUNK) {
    out.push({ heading, text })
    return
  }
  // corta em fim de parágrafo/frase mais próximo do limite
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + CHUNK, text.length)
    if (end < text.length) {
      const slice = text.slice(start, end)
      const cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf('\n'))
      if (cut > CHUNK * 0.5) end = start + cut + 1
    }
    out.push({ heading, text: text.slice(start, end).trim() })
    if (end >= text.length) break
    start = Math.max(end - OVERLAP, start + 1)
  }
}

export function chunkMarkdown(md: string): Chunk[] {
  const out: Chunk[] = []
  const lines = md.split('\n')
  let heading: string | null = null
  let parent: string | null = null
  let buf: string[] = []
  const flush = () => {
    splitLong(buf.join('\n'), heading, out)
    buf = []
  }
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.*)/)
    if (h) {
      flush()
      if (h[1].length <= 2) parent = h[2]
      heading = h[1].length === 3 && parent ? `${parent} › ${h[2]}` : h[2]
      continue
    }
    buf.push(line)
  }
  flush()
  return out
}

export function chunkPages(pages: string[]): Chunk[] {
  const out: Chunk[] = []
  // junta páginas em blocos e corta; heading = intervalo de páginas
  pages.forEach((p, i) => splitLong(p.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n'), `p. ${i + 1}`, out))
  return out
}

async function pdfPages(buf: Buffer): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const { text } = await extractText(pdf, { mergePages: false })
  return text as unknown as string[]
}

/** Insere/atualiza um documento e seus chunks (sem embeddings — o backfill cuida disso). */
export async function upsertDoc(d: {
  title: string
  category: string
  sourceType: 'guide' | 'pdf' | 'upload'
  sourceRef: string
  content: string
  hash: string
  chunks: Chunk[]
  pages?: number
}) {
  const existing = await one<{ id: number; content_hash: string }>('SELECT id, content_hash FROM docs WHERE source_ref=$1', [d.sourceRef])
  if (existing && existing.content_hash === d.hash) return { id: existing.id, changed: false }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let id: number
    if (existing) {
      id = existing.id
      await client.query(
        'UPDATE docs SET title=$1, category=$2, content=$3, content_hash=$4, pages=$5, updated_at=now() WHERE id=$6',
        [d.title, d.category, d.content, d.hash, d.pages ?? null, id]
      )
      await client.query('DELETE FROM chunks WHERE doc_id=$1', [id])
    } else {
      const r = await client.query(
        `INSERT INTO docs(title, category, source_type, source_ref, content, content_hash, pages)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [d.title, d.category, d.sourceType, d.sourceRef, d.content, d.hash, d.pages ?? null]
      )
      id = r.rows[0].id
    }
    for (let i = 0; i < d.chunks.length; i++) {
      const c = d.chunks[i]
      await client.query('INSERT INTO chunks(doc_id, idx, heading, text) VALUES($1,$2,$3,$4)', [id, i, c.heading, c.text])
    }
    await client.query('COMMIT')
    return { id, changed: true }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function ingestMarkdown(file: string, sourceType: 'guide' | 'upload', fallbackCategory = 'geral') {
  const raw = await readFile(file, 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  const title = meta.title || body.match(/^#\s+(.*)/m)?.[1] || path.basename(file, path.extname(file))
  return upsertDoc({
    title,
    category: meta.category || fallbackCategory,
    sourceType,
    sourceRef: nfc(path.relative(sourceType === 'guide' ? config.contentDir : config.uploadDir, file)),
    content: body,
    hash: sha(raw),
    chunks: chunkMarkdown(body),
  })
}

export async function ingestPdf(file: string, sourceType: 'pdf' | 'upload', category = 'referência', title?: string) {
  const buf = await readFile(file)
  const hash = sha(buf)
  const ref = nfc(path.relative(sourceType === 'pdf' ? config.pdfDir : config.uploadDir, file))
  const existing = await one<{ content_hash: string; id: number }>('SELECT id, content_hash FROM docs WHERE source_ref=$1', [ref])
  if (existing?.content_hash === hash) return { id: existing.id, changed: false }
  const pages = await pdfPages(buf)
  const content = pages.map((p, i) => `\n\n[página ${i + 1}]\n${p}`).join('')
  return upsertDoc({
    title: title ?? path.basename(file, path.extname(file)).replace(/_+/g, ' ').replace(/\s+/g, ' ').trim(),
    category,
    sourceType,
    sourceRef: ref,
    content,
    hash,
    chunks: chunkPages(pages),
    pages: pages.length,
  })
}

export async function ingestFile(file: string, sourceType: 'guide' | 'pdf' | 'upload', category?: string) {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.pdf') return ingestPdf(file, sourceType === 'guide' ? 'pdf' : (sourceType as 'pdf' | 'upload'), category)
  if (['.md', '.txt', '.markdown'].includes(ext)) return ingestMarkdown(file, sourceType === 'pdf' ? 'upload' : (sourceType as 'guide' | 'upload'), category)
  // código-fonte e outros textos: vira markdown com bloco de código
  const raw = await readFile(file, 'utf8')
  return upsertDoc({
    title: path.basename(file),
    category: category ?? 'código',
    sourceType: 'upload',
    sourceRef: nfc(path.relative(config.uploadDir, file)),
    content: raw,
    hash: sha(raw),
    chunks: chunkMarkdown(raw),
  })
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (!e.name.startsWith('.')) out.push(p)
  }
  return out
}

/** Sincroniza guias curados (content/) e PDFs de referência (data/pdfs) com o banco. */
export async function syncLibrary(log = console.log) {
  for (const f of await walk(config.contentDir)) {
    if (!f.endsWith('.md')) continue
    const cat = path.relative(config.contentDir, path.dirname(f)) || 'geral'
    const r = await ingestMarkdown(f, 'guide', cat)
    if (r.changed) log(`[kb] guia indexado: ${path.basename(f)}`)
  }
  for (const f of await walk(config.pdfDir)) {
    if (!f.toLowerCase().endsWith('.pdf')) continue
    try {
      const s = await stat(f)
      if (s.size === 0) continue
      const dir = path.relative(config.pdfDir, path.dirname(f))
      const PDF_CATS: Record<string, string> = {
        'onde-nao-ha-medico': 'Onde não há médico (Hesperian)',
        'onde-nao-ha-medico-novo': 'Onde não há médico (Hesperian)',
        'saude-ambiental': 'Saúde ambiental (Hesperian)',
        manuais: 'Manuais',
      }
      const r = await ingestPdf(f, 'pdf', PDF_CATS[dir] ?? (dir ? dir.replace(/-/g, ' ') : 'Referência'))
      if (r.changed) log(`[kb] PDF indexado: ${path.basename(f)}`)
    } catch (e) {
      log(`[kb] falha no PDF ${f}: ${(e as Error).message}`)
    }
  }
}

let backfilling = false
/** Gera embeddings pendentes em lotes. Roda em loop de fundo; se a IA estiver fora, tenta depois. */
export async function backfillEmbeddings(log = console.log) {
  if (backfilling) return
  backfilling = true
  try {
    for (;;) {
      const rows = await q<{ id: number; heading: string | null; text: string; title: string }>(
        `SELECT c.id, c.heading, c.text, d.title FROM chunks c JOIN docs d ON d.id=c.doc_id
         WHERE c.embedding IS NULL ORDER BY d.source_type='guide' DESC, c.id LIMIT 32`
      )
      if (!rows.length) break
      const vecs = await embed(rows.map((r) => `title: ${r.title}${r.heading ? ' | ' + r.heading : ''} | text: ${r.text}`))
      if (!vecs) break
      for (let i = 0; i < rows.length; i++) {
        await q('UPDATE chunks SET embedding=$1::vector WHERE id=$2', [`[${vecs[i].join(',')}]`, rows[i].id])
      }
      const left = await one<{ n: string }>('SELECT count(*) n FROM chunks WHERE embedding IS NULL')
      if (Number(left?.n) % 320 < 32) log(`[kb] embeddings pendentes: ${left?.n}`)
    }
  } finally {
    backfilling = false
  }
}

export type KbHit = {
  chunkId: number
  docId: number
  title: string
  category: string
  heading: string | null
  text: string
  score: number
}

/** Busca híbrida: full-text (PT+EN, OR entre termos) + vetorial, fundidas por Reciprocal Rank Fusion. */
export async function searchKb(query: string, limit = 8): Promise<KbHit[]> {
  const fts = await q<KbHit & { rank: number }>(
    `WITH qq AS (
       SELECT replace(plainto_tsquery('portuguese', $1)::text, '&', '|') AS pt,
              replace(plainto_tsquery('english', $1)::text, '&', '|') AS en
     )
     SELECT c.id "chunkId", d.id "docId", d.title, d.category, c.heading, c.text,
            ts_rank_cd(c.tsv, to_tsquery('portuguese', nullif(pt,'')) || to_tsquery('english', nullif(en,''))) rank
     FROM chunks c JOIN docs d ON d.id=c.doc_id, qq
     WHERE (pt <> '' AND c.tsv @@ to_tsquery('portuguese', pt)) OR (en <> '' AND c.tsv @@ to_tsquery('english', en))
     ORDER BY rank DESC LIMIT 30`,
    [query]
  ).catch(() => [] as (KbHit & { rank: number })[])

  let vec: (KbHit & { dist: number })[] = []
  const e = await embed([`task: search result | query: ${query}`])
  if (e?.[0]) {
    vec = await q(
      `SELECT c.id "chunkId", d.id "docId", d.title, d.category, c.heading, c.text, c.embedding <=> $1::vector dist
       FROM chunks c JOIN docs d ON d.id=c.doc_id
       WHERE c.embedding IS NOT NULL AND vector_dims(c.embedding) = $2
       ORDER BY dist LIMIT 30`,
      [`[${e[0].join(',')}]`, e[0].length]
    )
  }
  const scores = new Map<number, KbHit>()
  const add = (list: KbHit[], weight: number) =>
    list.forEach((h, i) => {
      const cur = scores.get(h.chunkId) ?? { ...h, score: 0 }
      cur.score += weight / (60 + i)
      scores.set(h.chunkId, cur)
    })
  add(fts, 1)
  add(vec, 1.2)
  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}
