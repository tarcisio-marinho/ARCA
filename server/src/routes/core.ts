import { createWriteStream } from 'node:fs'
import { mkdir, open, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { FastifyInstance } from 'fastify'
import { isOnline } from '../btc.ts'
import { config } from '../config.ts'
import { getSetting, one, q, setSetting } from '../db.ts'
import { backfillEmbeddings, ingestFile, searchKb } from '../kb.ts'
import { findEverywhere } from '../find.ts'
import { listBooks, searchAll } from '../kiwix.ts'
import { currentChatModel, listModels } from '../llm.ts'
import { listOps, runOp } from '../toolkit.ts'

async function dirSize(dir: string): Promise<number> {
  let total = 0
  try {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) total += await dirSize(p)
      else total += (await stat(p)).size
    }
  } catch {}
  return total
}

async function ping(url: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch {
    return false
  }
}

let sizeCache: { at: number; v: Record<string, number> } | null = null

export async function coreRoutes(app: FastifyInstance) {
  // ───────── status geral ─────────
  app.get('/api/status', async () => {
    const [internet, llmModels, embedOk, books, kb, current] = await Promise.all([
      isOnline('mainnet'),
      listModels().catch(() => null),
      ping(config.embedBaseUrl.replace(/\/v1$/, '') + '/health'),
      listBooks().catch(() => null),
      one<{ docs: string; chunks: string; pending: string }>(
        `SELECT (SELECT count(*) FROM docs) docs, (SELECT count(*) FROM chunks) chunks, (SELECT count(*) FROM chunks WHERE embedding IS NULL) pending`
      ),
      currentChatModel(),
    ])
    if (!sizeCache || Date.now() - sizeCache.at > 5 * 60_000) {
      sizeCache = {
        at: Date.now(),
        v: { zim: await dirSize(config.zimDir), maps: await dirSize(config.mapsDir), pdfs: await dirSize(config.pdfDir), uploads: await dirSize(config.uploadDir) },
      }
    }
    return {
      internet,
      llm: { ok: !!llmModels, models: llmModels ?? [], current },
      embed: { ok: embedOk },
      kiwix: { ok: !!books, books: books?.length ?? 0, articles: books?.reduce((s, b) => s + b.articleCount, 0) ?? 0 },
      kb: { docs: Number(kb?.docs ?? 0), chunks: Number(kb?.chunks ?? 0), pendingEmbeddings: Number(kb?.pending ?? 0) },
      storage: sizeCache.v,
      time: new Date().toISOString(),
    }
  })

  app.get('/api/settings', async () => ({
    chatModel: await currentChatModel(),
    household: await getSetting('household', { adults: 2, children: 0, pets: 0 }),
  }))
  app.put<{ Body: { chatModel?: string; household?: { adults: number; children: number; pets: number } } }>('/api/settings', async (req) => {
    if (req.body.chatModel) await setSetting('chat_model', req.body.chatModel)
    if (req.body.household) await setSetting('household', req.body.household)
    return { ok: true }
  })

  // ───────── biblioteca (kiwix) ─────────
  app.get('/api/library/books', async () => {
    const books = await listBooks(true)
    const files = await readdir(config.zimDir).catch(() => [] as string[])
    return Promise.all(
      books.map(async (b) => {
        const f = files.find((x) => x.startsWith(b.name + '_') && x.endsWith('.zim'))
        return { ...b, size: f ? (await stat(path.join(config.zimDir, f))).size : 0 }
      })
    )
  })
  app.get<{ Querystring: { q: string; lang?: string; book?: string; limit?: string } }>('/api/library/search', async (req) => {
    const { q: pattern, lang, book } = req.query
    if (!pattern?.trim()) return []
    return searchAll(pattern, { langs: lang ? [lang] : undefined, books: book ? [book] : undefined, perBook: 4, limit: Number(req.query.limit ?? 40) })
  })

  // ───────── documentos / guias (base de conhecimento) ─────────
  app.get<{ Querystring: { type?: string } }>('/api/docs', async (req) => {
    const type = req.query.type
    return q(
      `SELECT d.id, d.title, d.category, d.source_type "sourceType", d.source_ref "sourceRef", d.pages, length(d.content) chars,
              d.updated_at "updatedAt",
              (SELECT count(*) FROM chunks c WHERE c.doc_id=d.id)::int chunks,
              (SELECT count(*) FROM chunks c WHERE c.doc_id=d.id AND c.embedding IS NULL)::int pending
       FROM docs d ${type ? 'WHERE d.source_type = ANY($1)' : ''} ORDER BY d.category, d.title`,
      type ? [type.split(',')] : []
    )
  })
  app.get<{ Params: { id: string } }>('/api/docs/:id', async (req, reply) => {
    const d = await one('SELECT id, title, category, source_type "sourceType", source_ref "sourceRef", content, pages FROM docs WHERE id=$1', [Number(req.params.id)])
    if (!d) return reply.code(404).send({ error: 'não encontrado' })
    return d
  })
  app.get<{ Params: { id: string } }>('/api/docs/:id/file', async (req, reply) => {
    const d = await one<{ source_type: string; source_ref: string }>('SELECT source_type, source_ref FROM docs WHERE id=$1', [Number(req.params.id)])
    if (!d) return reply.code(404).send()
    const base = d.source_type === 'pdf' ? config.pdfDir : d.source_type === 'upload' ? config.uploadDir : config.contentDir
    const rel = path.normalize(d.source_ref).replace(/^(\.\.(\/|\\|$))+/, '')
    return reply.sendFile(rel, base)
  })
  app.delete<{ Params: { id: string } }>('/api/docs/:id', async (req) => {
    const d = await one<{ source_type: string; source_ref: string }>('SELECT source_type, source_ref FROM docs WHERE id=$1', [Number(req.params.id)])
    if (d?.source_type === 'upload') await unlink(path.join(config.uploadDir, path.basename(d.source_ref))).catch(() => {})
    await q('DELETE FROM docs WHERE id=$1', [Number(req.params.id)])
    return { ok: true }
  })
  app.post('/api/docs/upload', async (req, reply) => {
    await mkdir(config.uploadDir, { recursive: true })
    const results: { file: string; ok: boolean; error?: string; id?: number }[] = []
    let category = 'meus documentos'
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'category' && String(part.value).trim()) category = String(part.value).trim()
        continue
      }
      const safe = path.basename(part.filename).replace(/[^\w.\-À-ú ]+/g, '_')
      const dest = path.join(config.uploadDir, safe)
      await pipeline(part.file, createWriteStream(dest))
      try {
        const r = await ingestFile(dest, 'upload', category)
        results.push({ file: safe, ok: true, id: r.id })
      } catch (e) {
        results.push({ file: safe, ok: false, error: (e as Error).message })
      }
    }
    backfillEmbeddings().catch(() => {})
    return reply.send(results)
  })
  // busca literal (Ctrl+F) em guias, PDFs, uploads e notas
  app.get<{ Querystring: { q?: string } }>('/api/find', async (req) => findEverywhere(req.query.q ?? ''))
  app.post<{ Body: { q: string; limit?: number } }>('/api/docs/search', async (req) => searchKb(req.body.q, req.body.limit ?? 10))

  // ───────── toolkit ─────────
  app.get('/api/tools', async () => listOps())
  app.post<{ Body: { op: string; input?: string; params?: Record<string, string> } }>('/api/tools/run', async (req, reply) => {
    try {
      return { output: await runOp(req.body.op, req.body.input ?? '', req.body.params ?? {}) }
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }
  })

  // ───────── suprimentos ─────────
  const supplyCols = `id, name, category, quantity::float, unit, kcal_per_unit::float "kcalPerUnit", liters_per_unit::float "litersPerUnit",
                      expires_at "expiresAt", location, notes, updated_at "updatedAt"`
  app.get('/api/supplies', async () => q(`SELECT ${supplyCols} FROM supplies ORDER BY category, name`))
  app.post<{ Body: any }>('/api/supplies', async (req) => {
    const b = req.body as any
    return one(
      `INSERT INTO supplies(name, category, quantity, unit, kcal_per_unit, liters_per_unit, expires_at, location, notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${supplyCols}`,
      [b.name, b.category, b.quantity ?? 0, b.unit ?? 'un', b.kcalPerUnit || null, b.litersPerUnit || null, b.expiresAt || null, b.location || null, b.notes || null]
    )
  })
  app.put<{ Params: { id: string }; Body: any }>('/api/supplies/:id', async (req) => {
    const b = req.body as any
    return one(
      `UPDATE supplies SET name=$2, category=$3, quantity=$4, unit=$5, kcal_per_unit=$6, liters_per_unit=$7, expires_at=$8, location=$9, notes=$10, updated_at=now()
       WHERE id=$1 RETURNING ${supplyCols}`,
      [Number(req.params.id), b.name, b.category, b.quantity ?? 0, b.unit ?? 'un', b.kcalPerUnit || null, b.litersPerUnit || null, b.expiresAt || null, b.location || null, b.notes || null]
    )
  })
  app.delete<{ Params: { id: string } }>('/api/supplies/:id', async (req) => {
    await q('DELETE FROM supplies WHERE id=$1', [Number(req.params.id)])
    return { ok: true }
  })
  app.get('/api/supplies/summary', async () => {
    const h = await getSetting('household', { adults: 2, children: 0, pets: 0 })
    const rows = await q<{ category: string; quantity: number; kcal: number | null; liters: number | null; expires_at: string | null; name: string }>(
      `SELECT category, name, quantity::float, kcal_per_unit::float kcal, liters_per_unit::float liters, expires_at FROM supplies`
    )
    const liters = rows.reduce((s, r) => s + (r.category === 'agua' ? r.quantity * (r.liters ?? 1) : 0), 0)
    const kcal = rows.reduce((s, r) => s + (r.kcal ? r.quantity * r.kcal : 0), 0)
    // OMS/Defesa Civil: ~3 L/pessoa/dia (beber + cozinhar + higiene mínima); pet médio ~0,5 L
    const waterPerDay = h.adults * 3 + h.children * 2 + h.pets * 0.5
    const kcalPerDay = h.adults * 2000 + h.children * 1400
    const soon = new Date(Date.now() + 30 * 86400_000)
    return {
      household: h,
      water: { liters, perDay: waterPerDay, days: waterPerDay ? liters / waterPerDay : 0 },
      food: { kcal, perDay: kcalPerDay, days: kcalPerDay ? kcal / kcalPerDay : 0 },
      expiringSoon: rows.filter((r) => r.expires_at && new Date(r.expires_at) <= soon).map((r) => ({ name: r.name, expiresAt: r.expires_at })),
      counts: rows.reduce<Record<string, number>>((acc, r) => ((acc[r.category] = (acc[r.category] ?? 0) + 1), acc), {}),
    }
  })

  // ───────── notas ─────────
  app.get('/api/notes', async () => q(`SELECT id, title, body, pinned, updated_at "updatedAt" FROM notes ORDER BY pinned DESC, updated_at DESC`))
  app.post<{ Body: { title: string; body?: string; pinned?: boolean } }>('/api/notes', async (req) =>
    one(`INSERT INTO notes(title, body, pinned) VALUES($1,$2,$3) RETURNING id, title, body, pinned, updated_at "updatedAt"`, [
      req.body.title || 'Sem título',
      req.body.body ?? '',
      !!req.body.pinned,
    ])
  )
  app.put<{ Params: { id: string }; Body: { title: string; body: string; pinned: boolean } }>('/api/notes/:id', async (req) =>
    one(`UPDATE notes SET title=$2, body=$3, pinned=$4, updated_at=now() WHERE id=$1 RETURNING id, title, body, pinned, updated_at "updatedAt"`, [
      Number(req.params.id),
      req.body.title,
      req.body.body,
      !!req.body.pinned,
    ])
  )
  app.delete<{ Params: { id: string } }>('/api/notes/:id', async (req) => {
    await q('DELETE FROM notes WHERE id=$1', [Number(req.params.id)])
    return { ok: true }
  })

  // ───────── mapas ─────────
  app.get('/api/map/regions', async () => {
    const dir = path.join(config.mapsDir, 'pmtiles')
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.pmtiles'))
    const out = []
    for (const f of files) {
      const fh = await open(path.join(dir, f), 'r')
      const buf = Buffer.alloc(127)
      await fh.read(buf, 0, 127, 0)
      const size = (await fh.stat()).size
      await fh.close()
      const b = [buf.readInt32LE(102) / 1e7, buf.readInt32LE(106) / 1e7, buf.readInt32LE(110) / 1e7, buf.readInt32LE(114) / 1e7]
      const label = f.startsWith('world') ? 'Mundo (visão geral)' : f.startsWith('br_') ? 'Brasil (detalhado)' : f.startsWith('custom') ? 'Região personalizada' : f.replace('.pmtiles', '')
      out.push({ file: f, label, minZoom: buf[100], maxZoom: buf[101], bounds: b, size })
    }
    return out.sort((a, b) => b.maxZoom - a.maxZoom || a.size - b.size)
  })
  app.get('/api/map/points', async () => q('SELECT id, name, kind, lat, lng, notes, created_at "createdAt" FROM map_points ORDER BY id DESC'))
  app.post<{ Body: { name: string; kind: string; lat: number; lng: number; notes?: string } }>('/api/map/points', async (req) =>
    one('INSERT INTO map_points(name, kind, lat, lng, notes) VALUES($1,$2,$3,$4,$5) RETURNING id, name, kind, lat, lng, notes', [
      req.body.name,
      req.body.kind,
      req.body.lat,
      req.body.lng,
      req.body.notes ?? null,
    ])
  )
  app.delete<{ Params: { id: string } }>('/api/map/points/:id', async (req) => {
    await q('DELETE FROM map_points WHERE id=$1', [Number(req.params.id)])
    return { ok: true }
  })
}
