import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha2'
import { base64, createBase58check, hex } from '@scure/base'
import { HDKey } from '@scure/bip32'
import { entropyToMnemonic, generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import * as btc from '@scure/btc-signer'
import { randomBytes } from 'node:crypto'
import { config } from './config.ts'
import { one, q } from './db.ts'
import { decryptWithPassword, encryptWithPassword } from './toolkit.ts'

export type Network = 'mainnet' | 'testnet' | 'signet'
export type ScriptType = 'p2wpkh' | 'p2tr' | 'p2sh-p2wpkh' | 'p2pkh'

const b58c = createBase58check(sha256)
const NET = (n: Network) => (n === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK)
const VERSIONS = {
  mainnet: { private: 0x0488ade4, public: 0x0488b21e },
  test: { private: 0x04358394, public: 0x043587cf },
}
const ver = (n: Network) => (n === 'mainnet' ? VERSIONS.mainnet : VERSIONS.test)
const PURPOSE: Record<ScriptType, number> = { p2pkh: 44, 'p2sh-p2wpkh': 49, p2wpkh: 84, p2tr: 86 }
// vbytes aproximados por input/output para estimar taxa
const IN_VB: Record<ScriptType, number> = { p2wpkh: 68, p2tr: 57.5, 'p2sh-p2wpkh': 91, p2pkh: 148 }

export function accountPath(st: ScriptType, n: Network, account = 0) {
  return `m/${PURPOSE[st]}'/${n === 'mainnet' ? 0 : 1}'/${account}'`
}

/** Converte zpub/ypub/vpub/upub (SLIP-132) para xpub/tpub e infere o tipo de script. */
export function normalizeXpub(key: string): { xpub: string; network: Network; scriptType?: ScriptType } {
  const raw = b58c.decode(key.trim())
  const v = (raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3]
  const map: Record<number, { net: Network; st?: ScriptType }> = {
    [0x0488b21e]: { net: 'mainnet' }, // xpub
    [0x049d7cb2]: { net: 'mainnet', st: 'p2sh-p2wpkh' }, // ypub
    [0x04b24746]: { net: 'mainnet', st: 'p2wpkh' }, // zpub
    [0x043587cf]: { net: 'testnet' }, // tpub
    [0x044a5262]: { net: 'testnet', st: 'p2sh-p2wpkh' }, // upub
    [0x045f1cf6]: { net: 'testnet', st: 'p2wpkh' }, // vpub
  }
  const m = map[v >>> 0]
  if (!m) throw new Error('chave pública estendida não reconhecida (use xpub/ypub/zpub/tpub/upub/vpub)')
  const out = Uint8Array.from(raw)
  const target = m.net === 'mainnet' ? VERSIONS.mainnet.public : VERSIONS.test.public
  out[0] = (target >>> 24) & 0xff
  out[1] = (target >>> 16) & 0xff
  out[2] = (target >>> 8) & 0xff
  out[3] = target & 0xff
  return { xpub: b58c.encode(out), network: m.net, scriptType: m.st }
}

export function payment(pub: Uint8Array, st: ScriptType, n: Network) {
  const net = NET(n)
  switch (st) {
    case 'p2wpkh':
      return btc.p2wpkh(pub, net)
    case 'p2sh-p2wpkh':
      return btc.p2sh(btc.p2wpkh(pub, net), net)
    case 'p2pkh':
      return btc.p2pkh(pub, net)
    case 'p2tr':
      return btc.p2tr(pub.slice(1), undefined, net)
  }
}

export function validateAddress(addr: string, n: Network) {
  try {
    btc.Address(NET(n)).decode(addr.trim())
    return true
  } catch {
    return false
  }
}

// ───────────────────────── carteiras ─────────────────────────

type WalletRow = {
  id: number
  name: string
  network: Network
  kind: 'mnemonic' | 'xprv' | 'xpub' | 'wif'
  script_type: ScriptType
  account_path: string | null
  xpub: string | null
  single_address: string | null
  encrypted_secret: string | null
  created_at: string
}

export function newMnemonic(words: 12 | 24 = 12, extraEntropy?: string) {
  if (!extraEntropy) return generateMnemonic(wordlist, words === 24 ? 256 : 128)
  // mistura entropia do usuário (dados, moedas…) com o CSPRNG — nunca substitui
  const mix = sha256(new Uint8Array([...randomBytes(32), ...new TextEncoder().encode(extraEntropy)]))
  return entropyToMnemonic(mix.slice(0, words === 24 ? 32 : 16), wordlist)
}

export async function createWallet(input: {
  name: string
  network: Network
  kind: 'mnemonic' | 'xprv' | 'xpub' | 'wif'
  scriptType?: ScriptType
  secret: string // mnemonic | xprv | xpub | wif
  bip39Passphrase?: string
  password?: string // senha local para cifrar o segredo
  fingerprint?: string
}) {
  let st: ScriptType = input.scriptType ?? 'p2wpkh'
  let network = input.network
  let xpub: string | null = null
  let single: string | null = null
  let path: string | null = null
  let encrypted: string | null = null
  const secret = input.secret.trim()

  if (input.kind === 'mnemonic') {
    const m = secret.toLowerCase().split(/\s+/).join(' ')
    if (!validateMnemonic(m, wordlist)) throw new Error('mnemônico inválido (palavra fora da lista BIP39 ou checksum errado)')
    if (!input.password) throw new Error('defina uma senha local para proteger a semente')
    const root = HDKey.fromMasterSeed(mnemonicToSeedSync(m, input.bip39Passphrase ?? ''), ver(network))
    path = accountPath(st, network)
    xpub = root.derive(path).publicExtendedKey
    encrypted = encryptWithPassword(JSON.stringify({ mnemonic: m, passphrase: input.bip39Passphrase ?? '', fingerprint: root.fingerprint }), input.password)
  } else if (input.kind === 'xprv') {
    if (!input.password) throw new Error('defina uma senha local para proteger a chave')
    const k = HDKey.fromExtendedKey(secret, secret.startsWith('t') ? VERSIONS.test : VERSIONS.mainnet)
    network = secret.startsWith('t') ? (network === 'signet' ? 'signet' : 'testnet') : 'mainnet'
    xpub = k.publicExtendedKey
    path = 'conta (xprv importada)'
    encrypted = encryptWithPassword(JSON.stringify({ xprv: secret }), input.password)
  } else if (input.kind === 'xpub') {
    const n = normalizeXpub(secret)
    network = n.network === 'testnet' && network === 'signet' ? 'signet' : n.network
    st = n.scriptType ?? st
    xpub = n.xpub
    path = 'watch-only'
    if (input.fingerprint) encrypted = null
  } else if (input.kind === 'wif') {
    if (!input.password) throw new Error('defina uma senha local para proteger a chave')
    const priv = btc.WIF(NET(network)).decode(secret)
    const pub = secp256k1.getPublicKey(priv, true)
    single = payment(pub, st, network).address!
    encrypted = encryptWithPassword(JSON.stringify({ wif: secret }), input.password)
  }
  const r = await one<{ id: number }>(
    `INSERT INTO btc_wallets(name, network, kind, script_type, account_path, xpub, single_address, encrypted_secret)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [input.name, network, input.kind, st, path, xpub, single, encrypted]
  )
  return getWallet(r!.id)
}

export async function listWallets() {
  const rows = await q<WalletRow & { cache: any; fetched_at: string | null }>(
    `SELECT w.*, c.data cache, c.fetched_at FROM btc_wallets w LEFT JOIN btc_cache c ON c.wallet_id=w.id ORDER BY w.id`
  )
  return rows.map(publicWallet)
}

export async function getWallet(id: number) {
  const w = await one<WalletRow & { cache: any; fetched_at: string | null }>(
    `SELECT w.*, c.data cache, c.fetched_at FROM btc_wallets w LEFT JOIN btc_cache c ON c.wallet_id=w.id WHERE w.id=$1`,
    [id]
  )
  if (!w) throw new Error('carteira não encontrada')
  return publicWallet(w)
}

function publicWallet(w: WalletRow & { cache?: any; fetched_at?: string | null }) {
  return {
    id: w.id,
    name: w.name,
    network: w.network,
    kind: w.kind,
    scriptType: w.script_type,
    accountPath: w.account_path,
    xpub: w.xpub,
    watchOnly: !w.encrypted_secret,
    createdAt: w.created_at,
    balance: w.cache?.balance ?? null,
    nextReceive: w.cache?.nextReceive ?? null,
    fetchedAt: w.fetched_at ?? null,
    utxoCount: w.cache?.utxos?.length ?? 0,
  }
}

async function row(id: number) {
  const w = await one<WalletRow>('SELECT * FROM btc_wallets WHERE id=$1', [id])
  if (!w) throw new Error('carteira não encontrada')
  return w
}

/** Deriva o endereço (chain 0 = recebimento, 1 = troco) de uma carteira HD a partir do xpub. */
function deriveAddr(w: WalletRow, chain: number, index: number) {
  if (w.single_address) return { address: w.single_address, pub: null as Uint8Array | null, script: btc.OutScript.encode(btc.Address(NET(w.network)).decode(w.single_address)) }
  const acct = HDKey.fromExtendedKey(w.xpub!, ver(w.network))
  const pub = acct.deriveChild(chain).deriveChild(index).publicKey!
  const p = payment(pub, w.script_type, w.network)
  return { address: p.address!, pub, script: p.script }
}

export async function addresses(id: number, chain = 0, from = 0, count = 20) {
  const w = await row(id)
  if (w.single_address) return [{ chain: 0, index: 0, address: w.single_address }]
  return Array.from({ length: count }, (_, i) => ({ chain, index: from + i, address: deriveAddr(w, chain, from + i).address }))
}

// ───────────────────────── rede (Esplora) ─────────────────────────

// Backend que respondeu por último fica na frente (evita insistir num host travado)
const preferred: Record<string, number> = {}
async function esplora(n: Network, pathname: string, init?: RequestInit & { timeout?: number }) {
  const bases = config.esplora[n]
  const start = preferred[n] ?? 0
  let lastErr: Error = new Error('nenhum servidor Esplora configurado')
  for (let k = 0; k < bases.length; k++) {
    const i = (start + k) % bases.length
    try {
      for (let attempt = 0; ; attempt++) {
        const r = await fetch(bases[i] + pathname, { ...init, signal: AbortSignal.timeout(init?.timeout ?? 8000) })
        const text = await r.text()
        // APIs públicas limitam taxa (429): espera um pouco; se persistir, troca de servidor
        if (r.status === 429 && attempt < 2) {
          await new Promise((ok) => setTimeout(ok, 1500 * 2 ** attempt))
          continue
        }
        if (r.status === 429 || r.status >= 500) throw new Error(`Esplora ${r.status}`)
        if (!r.ok) {
          // 4xx de verdade (ex.: tx rejeitada) não adianta tentar em outro servidor
          const e = new Error(`Esplora ${r.status}: ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}`)
          ;(e as any).final = true
          throw e
        }
        preferred[n] = i
        return text
      }
    } catch (e) {
      lastErr = e as Error
      if ((e as any).final) throw e
    }
  }
  throw lastErr
}

export async function isOnline(n: Network = 'mainnet') {
  try {
    await esplora(n, '/blocks/tip/height', { timeout: 4000 })
    return true
  } catch {
    return false
  }
}

export async function feeEstimates(n: Network) {
  const j = JSON.parse(await esplora(n, '/fee-estimates'))
  return { rapida: Math.ceil(j['1'] ?? j['2'] ?? 10), normal: Math.ceil(j['6'] ?? 5), economica: Math.ceil(j['144'] ?? 1) }
}

type Utxo = { txid: string; vout: number; value: number; address: string; chain: number; index: number; confirmed: boolean; rawTx?: string }

/** Varre endereços com gap limit, consulta saldos/UTXOs e grava cache local (consultável offline). */
export async function sync(id: number) {
  const w = await row(id)
  const used: { chain: number; index: number; address: string; funded: number; spent: number; txs: number }[] = []
  const scanChain = async (chain: number, gap: number) => {
    let idx = 0
    let empty = 0
    let lastUsed = -1
    while (empty < gap && idx < 500) {
      const batch = Array.from({ length: 2 }, (_, i) => idx + i)
      const res = await Promise.all(
        batch.map(async (i) => {
          const a = deriveAddr(w, chain, i).address
          const j = JSON.parse(await esplora(w.network, `/address/${a}`))
          const txs = j.chain_stats.tx_count + j.mempool_stats.tx_count
          return {
            chain,
            index: i,
            address: a,
            txs,
            funded: j.chain_stats.funded_txo_sum + j.mempool_stats.funded_txo_sum,
            spent: j.chain_stats.spent_txo_sum + j.mempool_stats.spent_txo_sum,
          }
        })
      )
      for (const r of res) {
        if (r.txs > 0) {
          used.push(r)
          lastUsed = r.index
          empty = 0
        } else empty++
      }
      idx += 2
      if (w.single_address) break
    }
    return lastUsed + 1
  }
  const nextReceive = await scanChain(0, 10)
  const nextChange = w.single_address ? 0 : await scanChain(1, 6)

  const utxos: Utxo[] = []
  for (const u of used) {
    if (u.funded - u.spent <= 0) continue
    const list = JSON.parse(await esplora(w.network, `/address/${u.address}/utxo`))
    for (const x of list) {
      const item: Utxo = { txid: x.txid, vout: x.vout, value: x.value, address: u.address, chain: u.chain, index: u.index, confirmed: !!x.status?.confirmed }
      if (w.script_type === 'p2pkh') item.rawTx = (await esplora(w.network, `/tx/${x.txid}/hex`)).trim()
      utxos.push(item)
    }
  }
  const balance = {
    confirmed: utxos.filter((u) => u.confirmed).reduce((s, u) => s + u.value, 0),
    unconfirmed: utxos.filter((u) => !u.confirmed).reduce((s, u) => s + u.value, 0),
  }
  const data = { balance, utxos, used, nextReceive, nextChange }
  await q(
    `INSERT INTO btc_cache(wallet_id, data, fetched_at) VALUES($1,$2,now())
     ON CONFLICT(wallet_id) DO UPDATE SET data=excluded.data, fetched_at=now()`,
    [id, JSON.stringify(data)]
  )
  return getWallet(id)
}

async function cache(id: number) {
  const c = await one<{ data: any; fetched_at: string }>('SELECT data, fetched_at FROM btc_cache WHERE wallet_id=$1', [id])
  return c
}

export async function walletDetails(id: number) {
  const c = await cache(id)
  return { wallet: await getWallet(id), utxos: (c?.data.utxos ?? []) as Utxo[], used: c?.data.used ?? [], fetchedAt: c?.fetched_at ?? null }
}

// ───────────────────────── transações ─────────────────────────

const sats = (v: number | string | bigint) => BigInt(v)

/**
 * Monta PSBT não assinada a partir dos UTXOs em cache. Funciona 100% offline.
 * amount em satoshis; sendMax manda todo o saldo (menos taxa) pro primeiro destino.
 */
export async function buildPsbt(id: number, input: { outputs: { address: string; amount: number }[]; feeRate: number; sendMax?: boolean; includeUnconfirmed?: boolean }) {
  const w = await row(id)
  const c = await cache(id)
  if (!c) throw new Error('sem UTXOs em cache — sincronize a carteira quando houver internet (ou importe uma PSBT)')
  const net = NET(w.network)
  for (const o of input.outputs) if (!validateAddress(o.address, w.network)) throw new Error(`endereço inválido para ${w.network}: ${o.address}`)
  let pool: Utxo[] = c.data.utxos.filter((u: Utxo) => u.confirmed || input.includeUnconfirmed)
  pool = pool.sort((a, b) => b.value - a.value)
  const feeRate = Math.max(1, input.feeRate)
  const outVb = 31 * (input.outputs.length + 1)
  const estFee = (nIn: number, withChange: boolean) => Math.ceil((10.5 + IN_VB[w.script_type] * nIn + (withChange ? outVb : outVb - 31)) * feeRate)

  let selected: Utxo[] = []
  let fee = 0
  let change = 0
  if (input.sendMax) {
    selected = pool
    fee = estFee(selected.length, false)
    const total = selected.reduce((s, u) => s + u.value, 0)
    const amount = total - fee
    if (amount <= 546) throw new Error('saldo insuficiente para cobrir a taxa')
    input.outputs = [{ address: input.outputs[0].address, amount }]
  } else {
    const target = input.outputs.reduce((s, o) => s + o.amount, 0)
    let total = 0
    for (const u of pool) {
      selected.push(u)
      total += u.value
      fee = estFee(selected.length, true)
      if (total >= target + fee) break
    }
    if (total < target + fee) throw new Error(`saldo insuficiente: precisa ${target + fee} sats, disponível ${total}`)
    change = total - target - fee
    if (change < 546) {
      fee += change // poeira vira taxa
      change = 0
    }
  }

  const tx = new btc.Transaction({ allowUnknownOutputs: false })
  for (const u of selected) {
    const d = deriveAddr(w, u.chain, u.index)
    const base: any = { txid: u.txid, index: u.vout }
    if (w.script_type === 'p2pkh') base.nonWitnessUtxo = hex.decode(u.rawTx!)
    else base.witnessUtxo = { script: d.script, amount: sats(u.value) }
    if (w.script_type === 'p2sh-p2wpkh' && d.pub) base.redeemScript = btc.p2wpkh(d.pub, net).script
    if (w.script_type === 'p2tr' && d.pub) base.tapInternalKey = d.pub.slice(1)
    tx.addInput(base)
  }
  for (const o of input.outputs) tx.addOutputAddress(o.address, sats(o.amount), net)
  let changeAddress: string | null = null
  if (change > 0) {
    changeAddress = w.single_address ?? deriveAddr(w, 1, c.data.nextChange ?? 0).address
    tx.addOutputAddress(changeAddress, sats(change), net)
  }
  return {
    psbt: base64.encode(tx.toPSBT()),
    fee,
    change,
    changeAddress,
    inputs: selected.length,
    outputs: input.outputs,
  }
}

async function privKeyFinder(w: WalletRow, password: string) {
  const secret = JSON.parse(decryptWithPassword(w.encrypted_secret!, password).toString('utf8'))
  if (secret.wif) {
    const priv = btc.WIF(NET(w.network)).decode(secret.wif)
    const pub = secp256k1.getPublicKey(priv, true)
    const script = hex.encode(payment(pub, w.script_type, w.network).script)
    return (s: string) => (s === script ? priv : null)
  }
  const acct = secret.mnemonic
    ? HDKey.fromMasterSeed(mnemonicToSeedSync(secret.mnemonic, secret.passphrase ?? ''), ver(w.network)).derive(w.account_path!)
    : HDKey.fromExtendedKey(secret.xprv, ver(w.network))
  const c = await cache(w.id)
  const map = new Map<string, Uint8Array>()
  const maxR = Math.max(50, (c?.data.nextReceive ?? 0) + 20)
  const maxC = Math.max(30, (c?.data.nextChange ?? 0) + 20)
  for (const [chain, max] of [[0, maxR], [1, maxC]] as const) {
    const ck = acct.deriveChild(chain)
    for (let i = 0; i < max; i++) {
      const k = ck.deriveChild(i)
      map.set(hex.encode(payment(k.publicKey!, w.script_type, w.network).script), k.privateKey!)
    }
  }
  return (s: string) => map.get(s) ?? null
}

function inputScript(tx: btc.Transaction, i: number): Uint8Array | null {
  const inp = tx.getInput(i)
  if (inp.witnessUtxo) return inp.witnessUtxo.script
  if (inp.nonWitnessUtxo && inp.index !== undefined) return inp.nonWitnessUtxo.outputs[inp.index].script
  return null
}

/** Assina uma PSBT (nossa ou externa) com a chave da carteira. Totalmente offline. */
export async function signPsbt(id: number, psbtB64: string, password: string, finalize = true) {
  const w = await row(id)
  if (!w.encrypted_secret) throw new Error('carteira watch-only não assina — exporte a PSBT para o dispositivo com a chave')
  const find = await privKeyFinder(w, password)
  const tx = btc.Transaction.fromPSBT(base64.decode(psbtB64.trim()))
  let signed = 0
  for (let i = 0; i < tx.inputsLength; i++) {
    const s = inputScript(tx, i)
    const priv = s ? find(hex.encode(s)) : null
    if (!priv) continue
    tx.signIdx(priv, i)
    signed++
  }
  if (!signed) throw new Error('nenhum input desta PSBT pertence a esta carteira')
  let complete = false
  let txHex: string | null = null
  let txid: string | null = null
  if (finalize) {
    try {
      tx.finalize()
      complete = true
      txHex = tx.hex
      txid = tx.id
    } catch {
      complete = false
    }
  }
  return { psbt: base64.encode(tx.toPSBT()), signedInputs: signed, totalInputs: tx.inputsLength, complete, hex: txHex, txid }
}

/** Decodifica tx bruta (hex) ou PSBT (base64/hex) — mostra entradas, saídas, taxa e estado das assinaturas. */
export function decodeTx(data: string, n: Network = 'mainnet') {
  const s = data.trim()
  let tx: btc.Transaction
  let kind: 'psbt' | 'raw'
  const opts = { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true }
  if (/^cHNidP/.test(s)) {
    tx = btc.Transaction.fromPSBT(base64.decode(s), opts)
    kind = 'psbt'
  } else if (/^70736274ff/i.test(s)) {
    tx = btc.Transaction.fromPSBT(hex.decode(s), opts)
    kind = 'psbt'
  } else {
    tx = btc.Transaction.fromRaw(hex.decode(s.replace(/\s/g, '')), opts)
    kind = 'raw'
  }
  const net = NET(n)
  const addr = (script: Uint8Array) => {
    try {
      return btc.Address(net).encode(btc.OutScript.decode(script))
    } catch {
      return `script ${hex.encode(script).slice(0, 40)}…`
    }
  }
  let inSum = 0n
  let inKnown = true
  const inputs = Array.from({ length: tx.inputsLength }, (_, i) => {
    const inp = tx.getInput(i)
    const prev = inp.witnessUtxo ?? (inp.nonWitnessUtxo && inp.index !== undefined ? inp.nonWitnessUtxo.outputs[inp.index] : undefined)
    if (prev) inSum += prev.amount
    else inKnown = false
    return {
      prevout: `${inp.txid ? hex.encode(inp.txid) : '?'}:${inp.index}`,
      address: prev ? addr(prev.script) : null,
      amount: prev ? Number(prev.amount) : null,
      signed: !!(inp.finalScriptSig || inp.finalScriptWitness || inp.partialSig?.length || inp.tapKeySig),
      sequence: inp.sequence,
    }
  })
  let outSum = 0n
  const outputs = Array.from({ length: tx.outputsLength }, (_, i) => {
    const o = tx.getOutput(i)
    outSum += o.amount ?? 0n
    return { address: o.script ? addr(o.script) : '?', amount: Number(o.amount ?? 0) }
  })
  let txid: string | null = null
  let vsize: number | null = null
  try {
    txid = tx.id
    vsize = tx.isFinal ? tx.vsize : null
  } catch {}
  return {
    kind,
    txid,
    version: tx.version,
    locktime: tx.lockTime,
    isFinal: tx.isFinal,
    vsize,
    inputs,
    outputs,
    fee: inKnown ? Number(inSum - outSum) : null,
    feeRate: inKnown && vsize ? +(Number(inSum - outSum) / vsize).toFixed(2) : null,
    rbf: inputs.some((i) => (i.sequence ?? 0xffffffff) < 0xfffffffe),
  }
}

export function finalizePsbt(psbtB64: string) {
  const tx = btc.Transaction.fromPSBT(base64.decode(psbtB64.trim()))
  tx.finalize()
  return { hex: tx.hex, txid: tx.id }
}

/** Broadcast: tenta enviar já; se offline, guarda na fila para reenvio automático. */
export async function broadcast(txHex: string, n: Network, walletId?: number) {
  const h = txHex.trim()
  const t = btc.Transaction.fromRaw(hex.decode(h), { allowUnknownOutputs: true })
  const txid = t.id
  const existing = await one<{ id: number }>('SELECT id FROM btc_outbox WHERE txid=$1', [txid])
  const outId = existing?.id ?? (await one<{ id: number }>('INSERT INTO btc_outbox(wallet_id, network, txid, hex) VALUES($1,$2,$3,$4) RETURNING id', [walletId ?? null, n, txid, h]))!.id
  try {
    const res = await esplora(n, '/tx', { method: 'POST', body: h, headers: { 'content-type': 'text/plain' } })
    await q(`UPDATE btc_outbox SET status='broadcast', broadcast_at=now(), error=NULL WHERE id=$1`, [outId])
    return { txid: res.trim() || txid, status: 'broadcast' as const }
  } catch (e) {
    const msg = (e as Error).message
    const network = /fetch failed|timeout|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|aborted/i.test(msg)
    await q(`UPDATE btc_outbox SET status=$2, error=$3 WHERE id=$1`, [outId, network ? 'pending' : 'failed', msg])
    return { txid, status: network ? ('pending' as const) : ('failed' as const), error: msg }
  }
}

export async function retryOutbox() {
  const pend = await q<{ id: number; hex: string; network: Network; wallet_id: number | null }>(`SELECT * FROM btc_outbox WHERE status='pending'`)
  for (const p of pend) {
    if (!(await isOnline(p.network))) continue
    await broadcast(p.hex, p.network, p.wallet_id ?? undefined)
  }
}

// ───────────────────────── mensagens (BIP137 / "Bitcoin Signed Message") ─────────────────────────

function varint(n: number) {
  if (n < 0xfd) return Uint8Array.of(n)
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, n >> 8)
  return Uint8Array.of(0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24)
}
function messageHash(message: string) {
  const prefix = new TextEncoder().encode('\x18Bitcoin Signed Message:\n')
  const msg = new TextEncoder().encode(message)
  return sha256(sha256(new Uint8Array([...prefix, ...varint(msg.length), ...msg])))
}

export async function signMessage(id: number, message: string, password: string, chain = 0, index = 0) {
  const w = await row(id)
  if (!w.encrypted_secret) throw new Error('carteira watch-only não assina')
  if (w.script_type === 'p2tr') throw new Error('assinatura de mensagem BIP137 não existe para taproot (use BIP322 em outra ferramenta)')
  const find = await privKeyFinder(w, password)
  const d = deriveAddr(w, chain, index)
  const priv = find(hex.encode(d.script))
  if (!priv) throw new Error('chave do endereço não encontrada')
  const sig = secp256k1.sign(messageHash(message), priv)
  const headerBase = w.script_type === 'p2wpkh' ? 39 : w.script_type === 'p2sh-p2wpkh' ? 35 : 31
  const out = new Uint8Array(65)
  out[0] = headerBase + sig.recovery!
  out.set(sig.toCompactRawBytes(), 1)
  return { address: d.address, message, signature: base64.encode(out) }
}

/** Verifica assinatura BIP137 (Electrum/Sparrow/Bitcoin Core legado) — tenta todos os formatos de endereço. */
export function verifyMessage(address: string, message: string, signatureB64: string) {
  const raw = base64.decode(signatureB64.trim())
  if (raw.length !== 65) throw new Error('assinatura deve ter 65 bytes (base64)')
  const header = raw[0]
  if (header < 27 || header > 42) throw new Error('header de assinatura inválido')
  const recovery = (header - 27) & 3
  const compressed = header >= 31
  const sig = secp256k1.Signature.fromCompact(raw.slice(1)).addRecoveryBit(recovery)
  const point = sig.recoverPublicKey(messageHash(message))
  const pub = point.toRawBytes(compressed)
  const isTest = /^(tb1|m|n|2)/.test(address)
  const n: Network = isTest ? 'testnet' : 'mainnet'
  const candidates: string[] = [btc.p2pkh(pub, NET(n)).address!]
  if (compressed) candidates.push(btc.p2wpkh(pub, NET(n)).address!, btc.p2sh(btc.p2wpkh(pub, NET(n)), NET(n)).address!)
  const valid = candidates.includes(address.trim())
  return { valid, recoveredPubkey: hex.encode(pub), checkedFormats: candidates }
}

export function exportSecret(w: { encrypted_secret: string | null }, password: string) {
  if (!w.encrypted_secret) throw new Error('watch-only')
  return JSON.parse(decryptWithPassword(w.encrypted_secret, password).toString('utf8'))
}

export async function revealSecret(id: number, password: string) {
  return exportSecret(await row(id), password)
}

export async function deleteWallet(id: number) {
  await q('DELETE FROM btc_wallets WHERE id=$1', [id])
}

export async function outbox() {
  return q('SELECT id, wallet_id "walletId", network, txid, status, error, created_at "createdAt", broadcast_at "broadcastAt" FROM btc_outbox ORDER BY id DESC LIMIT 50')
}
