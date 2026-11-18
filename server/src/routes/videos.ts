import type { FastifyInstance } from 'fastify'
import { embedVideos, findVideos, getSegments, getVideo, listVideos, setIndexPaused, videoStatus } from '../videos.ts'
import { toVtt } from '../vtt.ts'

export async function videoRoutes(app: FastifyInstance) {
  app.get('/api/videos', async () => listVideos())
  // "Ctrl+F" nas falas de todos os vídeos
  app.get<{ Querystring: { q?: string; per?: string; limit?: string } }>('/api/videos/find', async (req) =>
    findVideos(req.query.q ?? '', { perVideo: Math.min(20, Number(req.query.per ?? 4)), maxVideos: Math.min(300, Number(req.query.limit ?? 150)) })
  )
  // progresso da indexação (tela Sistema) e pausar/retomar
  app.get('/api/videos/index', async () => videoStatus())
  app.put<{ Body: { paused: boolean } }>('/api/videos/index', async (req) => {
    await setIndexPaused(!!req.body?.paused)
    if (!req.body?.paused) embedVideos((m) => app.log.info(m)).catch(() => {})
    return videoStatus()
  })
  app.get<{ Params: { id: string } }>('/api/videos/:id', async (req, reply) => {
    const v = await getVideo(req.params.id)
    return v ?? reply.code(404).send({ error: 'vídeo não encontrado' })
  })
  // legenda limpa (1 cue por fala) para o <track> do player
  app.get<{ Params: { id: string } }>('/api/videos/:id/captions.vtt', async (req, reply) => {
    const segs = await getSegments(req.params.id)
    if (!segs) return reply.code(404).send('')
    return reply.type('text/vtt; charset=utf-8').header('cache-control', 'no-cache').send(toVtt(segs))
  })
}
