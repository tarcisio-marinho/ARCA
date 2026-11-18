// Vídeos offline (mini YouTube): catálogo de data/youtube/<canal>/, transcrição limpa a partir das legendas,
// "Ctrl+F" nas falas (em memória) e indexação no RAG (docs/chunks com tempo) com embeddings em segundo plano.
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.ts'
import { getSetting, one, q, setSetting } from './db.ts'
import { normalize, normQuery, positions } from './find.ts'
import { upsertDoc } from './kb.ts'
import { embed, llmBusy } from './llm.ts'
import { chunkSegments, fmtTime, parseVtt, type Seg } from './vtt.ts'

/** Ordem de preferência das legendas (auto pt-orig e pt são iguais; pt-BR às vezes é manual). */
const SUB_PRIORITY = ['pt-orig', 'pt', 'pt-BR']
/** Mude quando o parser/chunker mudar: força reprocessar tudo na próxima varredura. */
const PARSER_V = 1
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const fstat = (p: string) => stat(p).catch(() => null)

export const mediaUrl = (channel: string, file: string) => `/media/youtube/${encodeURIComponent(channel)}/${file.split('/').map(encodeURIComponent).join('/')}`

type Meta = { title?: string; upload_date?: string; duration?: number; description?: string; webpage_url?: string; channel?: string }

/** meta/<id>.json: o yt-dlp às vezes regravou o arquivo com várias linhas — vale só a primeira. */
async function readMeta(file: string): Promise<Meta> {
  try {
    const first = (await readFile(file, 'utf8')).split('\n').find((l) => l.trim())
    return first ? JSON.parse(first) : {}
  } catch {
    return {}
  }
}

// ───────────── varredura / ingestão ─────────────

export const scanState = { running: false, lastScanAt: null as string | null, lastMs: 0, changed: 0, removed: 0, errors: 0, done: 0, total: 0 }

async function ingestVideo(o: { id: string; channel: string; dir: string; lang: string | null; hasThumb: boolean; sig: string }) {
  const meta = await readMeta(path.join(o.dir, 'meta', `${o.id}.json`))
  const segs: Seg[] = o.lang ? parseVtt(await readFile(path.join(o.dir, `${o.id}.${o.lang}.vtt`), 'utf8')) : []
  const title = (meta.title ?? o.id).trim()
  const channelTitle = meta.channel ?? o.channel
  const ref = `video:${o.channel}/${o.id}`
  const chunks = chunkSegments(segs)
  let docId: number | null = null
  if (chunks.length) {
    const r = await upsertDoc({
      title,
      category: `Vídeos · ${channelTitle}`,
      sourceType: 'video',
      sourceRef: ref,
      content: chunks.map((c) => `[${fmtTime(c.start)}] ${c.text}`).join('\n\n'),
      hash: sha(`${PARSER_V}|${title}|${JSON.stringify(segs)}`), // mesmo texto = mantém trechos e embeddings
      // sem heading: no full-text o heading tem peso A e o título ("Como purificar PRATA?") afogava as falas de verdade.
      // O título entra no texto do embedding (busca semântica) e o agente mostra o título do doc.
      chunks: chunks.map((c) => ({ heading: null, text: c.text, tStart: c.start, tEnd: c.end })),
    })
    docId = r.id
  } else await q('DELETE FROM docs WHERE source_ref=$1', [ref])

  const d = meta.upload_date && /^\d{8}$/.test(meta.upload_date) ? `${meta.upload_date.slice(0, 4)}-${meta.upload_date.slice(4, 6)}-${meta.upload_date.slice(6)}` : null
  await q(
    `INSERT INTO videos(id, channel, channel_title, title, upload_date, duration, description, url, has_thumb, sub_lang, segments, words, n_chunks, doc_id, sig, updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15, now())
     ON CONFLICT(id) DO UPDATE SET channel=excluded.channel, channel_title=excluded.channel_title, title=excluded.title, upload_date=excluded.upload_date,
       duration=excluded.duration, description=excluded.description, url=excluded.url, has_thumb=excluded.has_thumb, sub_lang=excluded.sub_lang,
       segments=excluded.segments, words=excluded.words, n_chunks=excluded.n_chunks, doc_id=excluded.doc_id, sig=excluded.sig, updated_at=now()`,
    [
      o.id,
      o.channel,
      channelTitle,
      title,
      d,
      meta.duration != null ? Math.round(meta.duration) : null,
      meta.description ?? null,
      meta.webpage_url ?? null,
      o.hasThumb,
      segs.length ? o.lang : null,
      segs.length ? JSON.stringify(segs) : null,
      segs.reduce((s, x) => s + x[2].split(' ').length, 0),
      chunks.length,
      docId,
      o.sig,
    ]
  )
}

/** Sincroniza data/youtube com o banco. Idempotente: vídeo cuja assinatura (tamanho/mtime dos arquivos) não mudou é pulado. */
export async function scanVideos(log: (m: string) => void = console.log) {
  if (scanState.running) return
  scanState.running = true
  const t0 = Date.now()
  let changed = 0
  let removed = 0
  let errors = 0
  try {
    const channels = (await readdir(config.videosDir, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    const known = new Map((await q<{ id: string; sig: string; channel: string }>('SELECT id, sig, channel FROM videos')).map((r) => [r.id, r]))
    const seen = new Set<string>()
    const scanned = new Set<string>()
    for (const ch of channels) {
      const dir = path.join(config.videosDir, ch.name)
      const files = await readdir(dir).catch(() => [] as string[])
      if (!files.length) continue
      scanned.add(ch.name)
      const have = new Set(files)
      const thumbs = new Set(await readdir(path.join(dir, 'thumbs')).catch(() => [] as string[]))
      // só o arquivo final: o yt-dlp deixa .fNNN.mp4 / .temp.mp4 / .part no meio do caminho
      const ids = files.filter((f) => f.endsWith('.mp4') && !/\.(f\d+|temp)\.mp4$/.test(f)).map((f) => f.slice(0, -4))
      scanState.done = 0
      scanState.total = ids.length
      for (const id of ids) {
        scanState.done++
        seen.add(id)
        try {
          const lang = SUB_PRIORITY.find((l) => have.has(`${id}.${l}.vtt`)) ?? null
          const [mp4, vtt, meta] = await Promise.all([
            fstat(path.join(dir, `${id}.mp4`)),
            lang ? fstat(path.join(dir, `${id}.${lang}.vtt`)) : null,
            fstat(path.join(dir, 'meta', `${id}.json`)),
          ])
          if (!mp4?.size) continue
          const hasThumb = thumbs.has(`${id}.jpg`)
          const sig = [PARSER_V, mp4.size, Math.floor(mp4.mtimeMs), lang, vtt?.size ?? 0, Math.floor(vtt?.mtimeMs ?? 0), Math.floor(meta?.mtimeMs ?? 0), hasThumb ? 1 : 0].join(':')
          if (known.get(id)?.sig === sig) continue
          await ingestVideo({ id, channel: ch.name, dir, lang, hasThumb, sig })
          changed++
          if (changed % 100 === 0) log(`[videos] ${changed} vídeos processados (${scanState.done}/${ids.length})`)
        } catch (e) {
          errors++
          log(`[videos] falha em ${id}: ${(e as Error).message}`)
        }
      }
    }
    // some do disco → some do banco (só nos canais que foram lidos com sucesso, para não apagar tudo se o HD sumir)
    for (const [id, r] of known)
      if (!seen.has(id) && scanned.has(r.channel)) {
        await q('DELETE FROM docs WHERE source_ref=$1', [`video:${r.channel}/${id}`])
        await q('DELETE FROM videos WHERE id=$1', [id])
        removed++
      }
    // meta sem o campo "channel" caiu no nome da pasta: herda o nome mais comum do canal
    await q(
      `WITH m AS (SELECT channel, mode() WITHIN GROUP (ORDER BY channel_title) t FROM videos GROUP BY channel)
       UPDATE videos v SET channel_title = m.t FROM m WHERE v.channel = m.channel AND v.channel_title = v.channel AND m.t <> v.channel`
    )
    await q(
      `UPDATE docs d SET category = 'Vídeos · ' || v.channel_title FROM videos v
       WHERE d.id = v.doc_id AND d.category <> 'Vídeos · ' || v.channel_title`
    )
    if (changed || removed) log(`[videos] varredura: ${changed} novos/alterados, ${removed} removidos, ${errors} erros em ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  } finally {
    Object.assign(scanState, { running: false, lastScanAt: new Date().toISOString(), lastMs: Date.now() - t0, changed, removed, errors })
  }
}

// ───────────── catálogo ─────────────

const listCols = `id, channel, channel_title "channelTitle", title, to_char(upload_date, 'YYYY-MM-DD') "date", duration, has_thumb "hasThumb", sub_lang "subLang", words`

function withUrls<T extends { id: string; channel: string; hasThumb: boolean }>(v: T) {
  return { ...v, thumb: v.hasThumb ? mediaUrl(v.channel, `thumbs/${v.id}.jpg`) : null, src: mediaUrl(v.channel, `${v.id}.mp4`) }
}

export async function listVideos() {
  const rows = await q<{ id: string; channel: string; hasThumb: boolean }>(`SELECT ${listCols} FROM videos ORDER BY upload_date DESC NULLS LAST, id`)
  return rows.map(withUrls)
}

export async function getVideo(id: string) {
  const v = await one<{ id: string; channel: string; hasThumb: boolean; segments: Seg[] | null }>(
    `SELECT ${listCols}, description, url, segments, doc_id "docId" FROM videos WHERE id=$1`,
    [id]
  )
  return v ? { ...withUrls(v), segments: v.segments ?? [] } : null
}

export async function getSegments(id: string): Promise<Seg[] | null> {
  const r = await one<{ segments: Seg[] | null }>('SELECT segments FROM videos WHERE id=$1', [id])
  return r ? (r.segments ?? []) : null
}

// ───────────── "Ctrl+F" nas falas ─────────────

type VIdx = {
  id: string
  channel: string
  title: string
  normTitle: string
  date: string | null
  duration: number | null
  hasThumb: boolean
  orig: string // falas concatenadas (separadas por espaço)
  norm: string // idem, sem acento/maiúscula
  oOff: Int32Array // início de cada fala em orig
  nOff: Int32Array // início de cada fala em norm
  starts: Float32Array
}

// mesma normalização do find.ts (NFD sem marcas, minúsculas, espaços colapsados), só que por string inteira (rápido)
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim()

let findCache: { key: string; list: VIdx[] } | null = null
let building: Promise<VIdx[]> | null = null

async function loadIndex(): Promise<VIdx[]> {
  const sig = await one<{ k: string }>(`SELECT count(*)::text || ':' || coalesce(max(updated_at)::text, '') k FROM videos`)
  if (findCache && findCache.key === sig?.k) return findCache.list
  if (building) return building
  building = (async () => {
    const t0 = Date.now()
    const ids = (await q<{ id: string }>('SELECT id FROM videos ORDER BY id')).map((r) => r.id)
    const list: VIdx[] = []
    // em lotes: o JSON de todas as transcrições de uma vez pesaria ~150 MB de RAM transitória
    for (let i = 0; i < ids.length; i += 80) {
      const rows = await q<{ id: string; channel: string; title: string; date: string | null; duration: number | null; has_thumb: boolean; segments: Seg[] | null }>(
        `SELECT id, channel, title, to_char(upload_date, 'YYYY-MM-DD') date, duration, has_thumb, segments FROM videos WHERE id = ANY($1)`,
        [ids.slice(i, i + 80)]
      )
      for (const r of rows) {
        const segs = r.segments ?? []
        const oOff = new Int32Array(segs.length)
        const nOff = new Int32Array(segs.length)
        const starts = new Float32Array(segs.length)
        const o: string[] = []
        const n: string[] = []
        let ol = 0
        let nl = 0
        segs.forEach(([s, , t], k) => {
          const f = fold(t)
          oOff[k] = ol
          nOff[k] = nl
          starts[k] = s
          o.push(t)
          n.push(f)
          ol += t.length + 1
          nl += f.length + 1
        })
        list.push({ id: r.id, channel: r.channel, title: r.title, normTitle: normQuery(r.title), date: r.date, duration: r.duration, hasThumb: r.has_thumb, orig: o.join(' '), norm: n.join(' '), oOff, nOff, starts })
      }
    }
    findCache = { key: sig?.k ?? '', list }
    console.log(`[videos] índice de busca nas falas: ${list.length} vídeos em ${Date.now() - t0} ms`)
    return list
  })().finally(() => {
    building = null
  })
  return building
}

/** Aquece o índice depois da varredura (a primeira busca não paga a montagem). */
export const warmFindIndex = () => loadIndex().catch(() => {})

function segAt(off: Int32Array, pos: number) {
  let lo = 0
  let hi = off.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (off[mid] <= pos) lo = mid
    else hi = mid - 1
  }
  return lo
}

export type VideoSnippet = { t: number; text: string; hl: [number, number][] }
export type VideoHit = { id: string; channel: string; title: string; date: string | null; duration: number | null; thumb: string | null; count: number; titleMatch: boolean; snippets: VideoSnippet[] }

/** Trecho em volta da fala k (1 antes, 2 depois), com todas as ocorrências dos termos marcadas. */
function snippet(v: VIdx, k: number, terms: string[]): VideoSnippet {
  const a = Math.max(0, k - 1)
  const b = Math.min(v.oOff.length - 1, k + 2)
  const raw = v.orig.slice(v.oOff[a], b + 1 < v.oOff.length ? v.oOff[b + 1] - 1 : v.orig.length)
  const sub = normalize(raw)
  const hl: [number, number][] = []
  for (const t of terms) for (const p of positions(sub.text, t, 50)) hl.push([sub.map[p], sub.map[p + t.length - 1] + 1])
  hl.sort((x, y) => x[0] - y[0])
  const lead = a > 0 ? 1 : 0
  return { t: Math.floor(v.starts[k]), text: (a > 0 ? '…' : '') + raw + (b < v.oOff.length - 1 ? '…' : ''), hl: hl.map(([s, e]) => [s + lead, e + lead] as [number, number]) }
}

export async function findVideos(query: string, opts: { perVideo?: number; maxVideos?: number } = {}) {
  const t0 = Date.now()
  const phrase = normQuery(query)
  const empty = { query, mode: 'phrase' as 'phrase' | 'words', total: 0, videos: 0, hits: [] as VideoHit[], ms: 0 }
  if (phrase.length < 2) return empty
  const perVideo = opts.perVideo ?? 3
  const list = await loadIndex()

  const run = (terms: string[], requireAll: boolean) => {
    const hits: VideoHit[] = []
    for (const v of list) {
      const titleMatch = terms.every((t) => v.normTitle.includes(t))
      const perTerm = terms.map((t) => positions(v.norm, t))
      const inText = requireAll ? perTerm.every((p) => p.length) : perTerm[0].length > 0
      if (!inText && !titleMatch) continue
      const count = inText ? perTerm.reduce((s, p) => s + p.length, 0) : 0
      let cands = inText ? perTerm[0] : []
      if (inText && terms.length > 1) {
        // modo "todas as palavras": prefere pontos onde as outras palavras aparecem perto (±250 caracteres)
        const near = (p: number) => perTerm.slice(1).filter((ps) => ps.some((x) => Math.abs(x - p) < 250)).length
        cands = [...cands].sort((x, y) => near(y) - near(x) || x - y)
      }
      const picks: number[] = []
      for (const p of cands) {
        if (picks.length >= perVideo) break
        const k = segAt(v.nOff, p)
        if (picks.every((j) => Math.abs(v.starts[j] - v.starts[k]) > 20)) picks.push(k)
      }
      picks.sort((x, y) => x - y)
      hits.push({
        id: v.id,
        channel: v.channel,
        title: v.title,
        date: v.date,
        duration: v.duration,
        thumb: v.hasThumb ? mediaUrl(v.channel, `thumbs/${v.id}.jpg`) : null,
        count,
        titleMatch,
        snippets: picks.map((k) => snippet(v, k, terms)),
      })
    }
    return hits
  }

  let mode: 'phrase' | 'words' = 'phrase'
  let hits = run([phrase], false)
  const words = [...new Set(phrase.split(' ').filter((w) => w.length >= 2))]
  if (!hits.some((h) => h.count) && words.length > 1) {
    const w = run(words, true)
    if (w.length) {
      mode = 'words'
      hits = w
    }
  }
  hits.sort((a, b) => b.count - a.count || Number(b.titleMatch) - Number(a.titleMatch))
  hits.sort((a, b) => Number(b.titleMatch && b.count > 0) - Number(a.titleMatch && a.count > 0))
  return { query, mode, total: hits.reduce((s, h) => s + h.count, 0), videos: hits.length, hits: hits.slice(0, opts.maxVideos ?? 100), ms: Date.now() - t0 }
}

// ───────────── embeddings em segundo plano ─────────────

export const embedState = {
  running: false,
  paused: false,
  waitingLlm: false,
  total: 0, // trechos de vídeo
  pending: 0, // sem embedding
  rate: 0, // trechos/s com a máquina livre (média móvel)
  doneThisRun: 0,
  startedAt: null as string | null,
  lastError: null as string | null,
}
let countedAt = 0

async function refreshCounts() {
  const r = await one<{ total: number; pending: number }>(
    `SELECT count(*) FILTER (WHERE t_start IS NOT NULL)::int total, count(*) FILTER (WHERE t_start IS NOT NULL AND embedding IS NULL)::int pending FROM chunks`
  )
  embedState.total = r?.total ?? 0
  embedState.pending = r?.pending ?? 0
  countedAt = Date.now()
}

export const isIndexPaused = () => getSetting<boolean>('videos_index_paused', false)
export async function setIndexPaused(paused: boolean) {
  await setSetting('videos_index_paused', paused)
  embedState.paused = paused
}

/**
 * Gera os embeddings dos trechos de vídeo em lotes pequenos. Retomável (o que falta é "embedding IS NULL"),
 * pausa sozinho enquanto a IA gera uma resposta e pode ser pausado na tela Sistema.
 */
export async function embedVideos(log: (m: string) => void = console.log) {
  if (embedState.running) return
  embedState.running = true
  embedState.doneThisRun = 0
  embedState.startedAt = new Date().toISOString()
  try {
    await refreshCounts()
    if (embedState.pending) log(`[videos] embeddings: ${embedState.pending} de ${embedState.total} trechos na fila`)
    for (;;) {
      embedState.paused = await isIndexPaused()
      if (embedState.paused) {
        await sleep(3000)
        continue
      }
      if (llmBusy()) {
        embedState.waitingLlm = true
        await sleep(2000)
        continue
      }
      embedState.waitingLlm = false
      const rows = await q<{ id: number; text: string; title: string }>(
        `SELECT c.id, c.text, d.title FROM chunks c JOIN docs d ON d.id=c.doc_id
         WHERE c.embedding IS NULL AND c.t_start IS NOT NULL ORDER BY c.id LIMIT 16`
      )
      if (!rows.length) {
        await refreshCounts()
        if (!embedState.pending) break
        continue
      }
      const t0 = Date.now()
      const vecs = await embed(rows.map((r) => `title: ${r.title} | text: ${r.text}`))
      if (!vecs || vecs.length !== rows.length) {
        embedState.lastError = 'serviço de embeddings fora do ar — tento de novo em 30 s'
        await sleep(30_000)
        continue
      }
      embedState.lastError = null
      await q(`UPDATE chunks c SET embedding = u.e::vector FROM unnest($1::int[], $2::text[]) AS u(id, e) WHERE c.id = u.id`, [
        rows.map((r) => r.id),
        vecs.map((v) => `[${v.join(',')}]`),
      ])
      const inst = rows.length / Math.max(0.05, (Date.now() - t0) / 1000)
      embedState.rate = embedState.rate ? embedState.rate * 0.9 + inst * 0.1 : inst
      embedState.pending = Math.max(0, embedState.pending - rows.length)
      embedState.doneThisRun += rows.length
      if (embedState.doneThisRun % 1024 < 16) log(`[videos] embeddings: faltam ${embedState.pending} (${embedState.rate.toFixed(1)} trechos/s)`)
      if (Date.now() - countedAt > 5 * 60_000) await refreshCounts()
      await sleep(50) // respiro para o resto do app
    }
    log('[videos] embeddings dos vídeos em dia')
  } catch (e) {
    embedState.lastError = (e as Error).message
    log(`[videos] embeddings pararam: ${(e as Error).message}`)
  } finally {
    embedState.running = false
    embedState.waitingLlm = false
  }
}

export async function videoStatus() {
  if (!embedState.running && Date.now() - countedAt > 60_000) await refreshCounts().catch(() => {})
  const v = await one<{ videos: number; transcribed: number; hours: number; words: number }>(
    `SELECT count(*)::int videos, count(*) FILTER (WHERE sub_lang IS NOT NULL)::int transcribed, coalesce(sum(duration),0)/3600.0 hours, coalesce(sum(words),0)::int words FROM videos`
  )
  const db = await one<{ size: string }>(`SELECT pg_database_size(current_database())::text size`)
  const eta = embedState.rate && embedState.pending ? Math.round(embedState.pending / embedState.rate) : 0
  return {
    videos: v?.videos ?? 0,
    transcribed: v?.transcribed ?? 0,
    hours: Number(v?.hours ?? 0),
    words: v?.words ?? 0,
    chunks: embedState.total,
    embedded: embedState.total - embedState.pending,
    pending: embedState.pending,
    running: embedState.running,
    paused: embedState.paused || (await isIndexPaused()),
    waitingLlm: embedState.waitingLlm,
    rate: Math.round(embedState.rate * 10) / 10,
    etaSeconds: eta,
    lastError: embedState.lastError,
    scan: { ...scanState },
    dbBytes: Number(db?.size ?? 0),
  }
}
