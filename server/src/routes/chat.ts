import type { FastifyInstance } from 'fastify'
import { runAgent, type Mode } from '../agent.ts'
import { one, q } from '../db.ts'

export async function chatRoutes(app: FastifyInstance) {
  app.get('/api/chat/conversations', async () =>
    q(`SELECT id, title, mode, updated_at "updatedAt" FROM conversations ORDER BY updated_at DESC LIMIT 200`)
  )
  app.post<{ Body: { mode?: Mode } }>('/api/chat/conversations', async (req) =>
    one(`INSERT INTO conversations(mode) VALUES($1) RETURNING id, title, mode, updated_at "updatedAt"`, [req.body?.mode ?? 'assistant'])
  )
  app.patch<{ Params: { id: string }; Body: { title: string } }>('/api/chat/conversations/:id', async (req) =>
    one(`UPDATE conversations SET title=$2 WHERE id=$1 RETURNING id, title`, [req.params.id, req.body.title])
  )
  app.delete<{ Params: { id: string } }>('/api/chat/conversations/:id', async (req) => {
    await q('DELETE FROM conversations WHERE id=$1', [req.params.id])
    return { ok: true }
  })
  app.get<{ Params: { id: string } }>('/api/chat/conversations/:id/messages', async (req) =>
    q(`SELECT id, role, content, meta, created_at "createdAt" FROM messages WHERE conversation_id=$1 ORDER BY id`, [req.params.id])
  )

  /** Envia mensagem e recebe a resposta por Server-Sent Events (texto, raciocínio, ferramentas, fontes). */
  app.post<{ Params: { id: string }; Body: { content: string; mode?: Mode; think?: boolean } }>(
    '/api/chat/conversations/:id/send',
    async (req, reply) => {
      reply.hijack()
      const res = reply.raw
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      const ac = new AbortController()
      res.on('close', () => ac.abort())
      const send = (e: unknown) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`)
      }
      const hb = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), 15000)
      try {
        await runAgent({
          conversationId: req.params.id,
          userMessage: req.body.content,
          mode: req.body.mode ?? 'assistant',
          think: !!req.body.think,
          signal: ac.signal,
          emit: send,
        })
      } catch (e) {
        if (!ac.signal.aborted) send({ type: 'error', message: (e as Error).message })
      } finally {
        clearInterval(hb)
        res.end()
      }
    }
  )
}
