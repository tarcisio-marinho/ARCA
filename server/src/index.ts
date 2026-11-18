import httpProxy from '@fastify/http-proxy'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { retryOutbox } from './btc.ts'
import { config } from './config.ts'
import { migrate } from './db.ts'
import { backfillEmbeddings, syncLibrary } from './kb.ts'
import { btcRoutes } from './routes/btc.ts'
import { chatRoutes } from './routes/chat.ts'
import { coreRoutes } from './routes/core.ts'
import { translateRoutes } from './routes/translate.ts'

const app = Fastify({ logger: { level: 'info' }, bodyLimit: 20 * 1024 * 1024 })

await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024, files: 50 } })

// Frontend (SPA) + sendFile genérico
const webDir = path.resolve(config.webDir)
await app.register(fastifyStatic, { root: webDir, prefix: '/', wildcard: false })
// Mapas offline: PMTiles servido por HTTP Range direto do disco
await app.register(fastifyStatic, { root: path.resolve(config.mapsDir), prefix: '/maps/', decorateReply: false, acceptRanges: true, cacheControl: true, maxAge: '7d' })

// Enciclopédias (kiwix-serve) e CyberChef atrás do mesmo host → mesma origem pro iframe
await app.register(httpProxy, { upstream: config.kiwixUrl.replace(/\/kiwix$/, ''), prefix: '/kiwix', rewritePrefix: '/kiwix', http2: false })
await app.register(httpProxy, { upstream: config.cyberchefUrl, prefix: '/cyberchef', rewritePrefix: '', http2: false })

await app.register(coreRoutes)
await app.register(chatRoutes)
await app.register(translateRoutes)
await app.register(btcRoutes)

app.get('/api/health', async () => ({ ok: true }))

// Fallback da SPA
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'rota não encontrada' })
  if (existsSync(path.join(webDir, 'index.html'))) return reply.type('text/html').sendFile('index.html')
  return reply.code(404).send('frontend não compilado')
})

await migrate()
for (const d of [config.uploadDir, config.workspaceDir, config.pdfDir]) await mkdir(d, { recursive: true }).catch(() => {})
await app.listen({ host: '0.0.0.0', port: config.port })

// Tarefas de fundo: indexar acervo, gerar embeddings, reenviar transações pendentes
const log = (m: string) => app.log.info(m)
;(async () => {
  try {
    await syncLibrary(log)
  } catch (e) {
    app.log.error(e, 'syncLibrary')
  }
  backfillEmbeddings(log).catch(() => {})
})()
setInterval(async () => {
  await syncLibrary(log).catch(() => {}) // pega guias/PDFs novos ou editados (hash não mudou = no-op)
  await backfillEmbeddings(log).catch(() => {})
}, 2 * 60_000)
setInterval(() => retryOutbox().catch(() => {}), 5 * 60_000)
