import type { FastifyInstance, FastifyReply } from 'fastify'
import * as B from '../btc.ts'

const wrap =
  <T>(fn: (req: any) => Promise<T> | T) =>
  async (req: any, reply: FastifyReply) => {
    try {
      return await fn(req)
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }
  }

export async function btcRoutes(app: FastifyInstance) {
  app.get('/api/btc/wallets', wrap(() => B.listWallets()))
  app.post('/api/btc/wallets', wrap((r) => B.createWallet(r.body)))
  app.get('/api/btc/wallets/:id', wrap((r) => B.walletDetails(Number(r.params.id))))
  app.delete('/api/btc/wallets/:id', wrap(async (r) => (await B.deleteWallet(Number(r.params.id)), { ok: true })))
  app.post('/api/btc/wallets/:id/sync', wrap((r) => B.sync(Number(r.params.id))))
  app.get('/api/btc/wallets/:id/addresses', wrap((r) => B.addresses(Number(r.params.id), Number(r.query.chain ?? 0), Number(r.query.from ?? 0), Math.min(100, Number(r.query.count ?? 20)))))
  app.post('/api/btc/wallets/:id/psbt', wrap((r) => B.buildPsbt(Number(r.params.id), r.body)))
  app.post('/api/btc/wallets/:id/sign', wrap((r) => B.signPsbt(Number(r.params.id), r.body.psbt, r.body.password, r.body.finalize ?? true)))
  app.post('/api/btc/wallets/:id/sign-message', wrap((r) => B.signMessage(Number(r.params.id), r.body.message, r.body.password, r.body.chain ?? 0, r.body.index ?? 0)))
  app.post('/api/btc/wallets/:id/reveal', wrap((r) => B.revealSecret(Number(r.params.id), r.body.password)))

  app.post('/api/btc/mnemonic', wrap((r) => ({ mnemonic: B.newMnemonic(r.body?.words === 24 ? 24 : 12, r.body?.extraEntropy) })))
  app.post('/api/btc/verify-message', wrap((r) => B.verifyMessage(r.body.address, r.body.message, r.body.signature)))
  app.post('/api/btc/decode', wrap((r) => B.decodeTx(r.body.data, r.body.network ?? 'mainnet')))
  app.post('/api/btc/finalize', wrap((r) => B.finalizePsbt(r.body.psbt)))
  app.post('/api/btc/broadcast', wrap((r) => B.broadcast(r.body.hex, r.body.network ?? 'mainnet', r.body.walletId)))
  app.get('/api/btc/outbox', wrap(() => B.outbox()))
  app.post('/api/btc/outbox/retry', wrap(async () => (await B.retryOutbox(), { ok: true })))
  app.get('/api/btc/fees', wrap((r) => B.feeEstimates(r.query.network ?? 'mainnet')))
  app.get('/api/btc/online', wrap(async (r) => ({ online: await B.isOnline(r.query.network ?? 'mainnet') })))
  app.post('/api/btc/validate-address', wrap((r) => ({ valid: B.validateAddress(r.body.address, r.body.network ?? 'mainnet') })))
}
