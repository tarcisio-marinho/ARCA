import { ripemd160 } from '@noble/hashes/legacy'
import { sha256 } from '@noble/hashes/sha2'
import { base32, base58, createBase58check } from '@scure/base'
import * as nc from 'node:crypto'
import zlib from 'node:zlib'

export type Param = { name: string; label: string; type: 'text' | 'select' | 'number' | 'password' | 'textarea'; options?: string[]; default?: string }
export type Op = {
  id: string
  group: string
  label: string
  description: string
  input?: string // rótulo da entrada principal (omitido = não usa entrada)
  params?: Param[]
  run: (input: string, p: Record<string, string>) => string | Promise<string>
}

const b58c = createBase58check(sha256)
const enc = new TextEncoder()
const dec = new TextDecoder()
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex')
const fromHex = (h: string) => {
  const clean = h.replace(/^0x/i, '').replace(/[\s:]/g, '')
  if (!/^[0-9a-f]*$/i.test(clean) || clean.length % 2) throw new Error('hex inválido')
  return Uint8Array.from(Buffer.from(clean, 'hex'))
}
const bytesIn = (input: string, fmt = 'texto') => (fmt === 'hex' ? fromHex(input) : fmt === 'base64' ? Uint8Array.from(Buffer.from(input.trim(), 'base64')) : enc.encode(input))
const fmtParam: Param = { name: 'fmt', label: 'Entrada é', type: 'select', options: ['texto', 'hex', 'base64'], default: 'texto' }

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '-': '-....-', '(': '-.--.', ')': '-.--.-', '@': '.--.-.', '=': '-...-', '!': '-.-.--',
}
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))
const NATO = 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split(' ')

function shift(s: string, n: number) {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + n + 26 * 10) % 26) + base)
  })
}

// Pacote AES-GCM com senha: "arca1:" + base64( salt(16) | iv(12) | tag(16) | ciphertext ). scrypt N=2^15.
export function encryptWithPassword(plain: string | Uint8Array, password: string) {
  const salt = nc.randomBytes(16)
  const iv = nc.randomBytes(12)
  const key = nc.scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const c = nc.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(typeof plain === 'string' ? Buffer.from(plain, 'utf8') : Buffer.from(plain)), c.final()])
  return 'arca1:' + Buffer.concat([salt, iv, c.getAuthTag(), ct]).toString('base64')
}
export function decryptWithPassword(bundle: string, password: string): Buffer {
  const raw = Buffer.from(bundle.trim().replace(/^arca1:/, ''), 'base64')
  if (raw.length < 45) throw new Error('pacote cifrado inválido')
  const salt = raw.subarray(0, 16)
  const iv = raw.subarray(16, 28)
  const tag = raw.subarray(28, 44)
  const ct = raw.subarray(44)
  const key = nc.scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const d = nc.createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  try {
    return Buffer.concat([d.update(ct), d.final()])
  } catch {
    throw new Error('senha incorreta ou dados corrompidos')
  }
}

const hashAlgos = ['sha256', 'sha512', 'sha1', 'md5', 'sha3-256', 'sha3-512', 'blake2b512', 'ripemd160', 'hash160 (btc)', 'sha256d (btc)', 'crc32']
function hash(alg: string, data: Uint8Array): string {
  if (alg === 'ripemd160') return toHex(ripemd160(data))
  if (alg === 'hash160 (btc)') return toHex(ripemd160(sha256(data)))
  if (alg === 'sha256d (btc)') return toHex(sha256(sha256(data)))
  if (alg === 'crc32') return (zlib as any).crc32(Buffer.from(data)).toString(16).padStart(8, '0')
  return nc.createHash(alg).update(data).digest('hex')
}

export const OPS: Op[] = [
  // ── Codificação ──
  { id: 'base64.encode', group: 'Codificação', label: 'Base64 → codificar', description: 'Texto/bytes para Base64', input: 'Entrada', params: [fmtParam], run: (i, p) => Buffer.from(bytesIn(i, p.fmt)).toString('base64') },
  { id: 'base64.decode', group: 'Codificação', label: 'Base64 → decodificar', description: 'Base64 (ou base64url) para texto', input: 'Base64', params: [{ name: 'out', label: 'Saída', type: 'select', options: ['texto', 'hex'], default: 'texto' }], run: (i, p) => { const b = Buffer.from(i.trim().replace(/-/g, '+').replace(/_/g, '/'), 'base64'); return p.out === 'hex' ? b.toString('hex') : b.toString('utf8') } },
  { id: 'base64url.encode', group: 'Codificação', label: 'Base64URL → codificar', description: 'Variante segura para URL/JWT', input: 'Texto', run: (i) => Buffer.from(i, 'utf8').toString('base64url') },
  { id: 'hex.encode', group: 'Codificação', label: 'Hex → codificar', description: 'Texto para hexadecimal', input: 'Texto', run: (i) => toHex(enc.encode(i)) },
  { id: 'hex.decode', group: 'Codificação', label: 'Hex → decodificar', description: 'Hexadecimal para texto', input: 'Hex', run: (i) => dec.decode(fromHex(i)) },
  { id: 'base32.encode', group: 'Codificação', label: 'Base32 → codificar', description: 'RFC 4648', input: 'Texto', params: [fmtParam], run: (i, p) => base32.encode(bytesIn(i, p.fmt)) },
  { id: 'base32.decode', group: 'Codificação', label: 'Base32 → decodificar', description: 'RFC 4648', input: 'Base32', run: (i) => dec.decode(base32.decode(i.trim().toUpperCase())) },
  { id: 'base58.encode', group: 'Codificação', label: 'Base58 → codificar', description: 'Alfabeto Bitcoin', input: 'Entrada', params: [{ ...fmtParam, default: 'hex' }], run: (i, p) => base58.encode(bytesIn(i, p.fmt)) },
  { id: 'base58.decode', group: 'Codificação', label: 'Base58 → decodificar (hex)', description: 'Base58 para hex', input: 'Base58', run: (i) => toHex(base58.decode(i.trim())) },
  { id: 'base58check.decode', group: 'Codificação', label: 'Base58Check → decodificar', description: 'Valida checksum (endereços legados, WIF, xpub) e mostra payload em hex', input: 'Base58Check', run: (i) => { const b = b58c.decode(i.trim()); return `versão: 0x${toHex(b.slice(0, 1))}\npayload (${b.length - 1} bytes): ${toHex(b.slice(1))}\nchecksum: OK` } },
  { id: 'url.encode', group: 'Codificação', label: 'URL → codificar', description: 'encodeURIComponent', input: 'Texto', run: (i) => encodeURIComponent(i) },
  { id: 'url.decode', group: 'Codificação', label: 'URL → decodificar', description: 'decodeURIComponent', input: 'Texto', run: (i) => decodeURIComponent(i) },
  { id: 'binary.encode', group: 'Codificação', label: 'Binário ← texto', description: 'Bytes em 0/1', input: 'Texto', run: (i) => [...enc.encode(i)].map((b) => b.toString(2).padStart(8, '0')).join(' ') },
  { id: 'binary.decode', group: 'Codificação', label: 'Binário → texto', description: 'Grupos de 8 bits', input: 'Binário', run: (i) => dec.decode(Uint8Array.from(i.replace(/[^01]/g, '').match(/.{8}/g) ?? [], (b) => parseInt(b, 2))) },
  { id: 'html.escape', group: 'Codificação', label: 'HTML → escapar', description: '< > & " \'', input: 'Texto', run: (i) => i.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') },
  { id: 'number.base', group: 'Codificação', label: 'Conversor de base numérica', description: 'Converte inteiros entre bases 2–36 (precisão arbitrária)', input: 'Número', params: [{ name: 'from', label: 'De base', type: 'number', default: '10' }, { name: 'to', label: 'Para base', type: 'number', default: '16' }], run: (i, p) => { const from = Number(p.from), to = Number(p.to); let n = 0n; for (const c of i.trim().toLowerCase()) { const d = parseInt(c, 36); if (isNaN(d) || d >= from) throw new Error(`dígito inválido: ${c}`); n = n * BigInt(from) + BigInt(d) } return n.toString(to) } },

  // ── Hash ──
  { id: 'hash', group: 'Hash & Integridade', label: 'Hash', description: 'SHA-2, SHA-3, MD5, BLAKE2, RIPEMD-160, hash160/sha256d do Bitcoin, CRC32', input: 'Entrada', params: [{ name: 'alg', label: 'Algoritmo', type: 'select', options: hashAlgos, default: 'sha256' }, fmtParam], run: (i, p) => hash(p.alg || 'sha256', bytesIn(i, p.fmt)) },
  { id: 'hash.all', group: 'Hash & Integridade', label: 'Todos os hashes', description: 'Calcula todos de uma vez (útil para conferir integridade de arquivos/textos)', input: 'Entrada', params: [fmtParam], run: (i, p) => hashAlgos.map((a) => `${a.padEnd(14)} ${hash(a, bytesIn(i, p.fmt))}`).join('\n') },
  { id: 'hmac', group: 'Hash & Integridade', label: 'HMAC', description: 'Código de autenticação de mensagem', input: 'Mensagem', params: [{ name: 'key', label: 'Chave', type: 'text' }, { name: 'alg', label: 'Algoritmo', type: 'select', options: ['sha256', 'sha512', 'sha1', 'md5'], default: 'sha256' }], run: (i, p) => nc.createHmac(p.alg || 'sha256', p.key ?? '').update(i).digest('hex') },
  { id: 'pbkdf2', group: 'Hash & Integridade', label: 'PBKDF2', description: 'Deriva chave de senha', input: 'Senha', params: [{ name: 'salt', label: 'Salt', type: 'text' }, { name: 'iter', label: 'Iterações', type: 'number', default: '100000' }, { name: 'len', label: 'Bytes', type: 'number', default: '32' }], run: (i, p) => nc.pbkdf2Sync(i, p.salt ?? '', Number(p.iter || 100000), Number(p.len || 32), 'sha256').toString('hex') },

  // ── Criptografia ──
  { id: 'aes.encrypt', group: 'Criptografia', label: 'Cifrar com senha (AES-256-GCM)', description: 'scrypt + AES-256-GCM autenticado. Saída portátil "arca1:..."', input: 'Texto secreto', params: [{ name: 'password', label: 'Senha', type: 'password' }], run: (i, p) => { if (!p.password) throw new Error('informe a senha'); return encryptWithPassword(i, p.password) } },
  { id: 'aes.decrypt', group: 'Criptografia', label: 'Decifrar com senha (AES-256-GCM)', description: 'Abre um pacote "arca1:..."', input: 'Pacote cifrado', params: [{ name: 'password', label: 'Senha', type: 'password' }], run: (i, p) => decryptWithPassword(i, p.password ?? '').toString('utf8') },
  { id: 'keys.generate', group: 'Criptografia', label: 'Gerar par de chaves', description: 'Ed25519, RSA-3072 ou secp256k1 (PEM)', params: [{ name: 'type', label: 'Tipo', type: 'select', options: ['ed25519', 'rsa-3072', 'secp256k1', 'x25519'], default: 'ed25519' }], run: (_i, p) => { const t = p.type || 'ed25519'; const kp = t === 'rsa-3072' ? nc.generateKeyPairSync('rsa', { modulusLength: 3072 }) : t === 'secp256k1' ? nc.generateKeyPairSync('ec', { namedCurve: 'secp256k1' }) : nc.generateKeyPairSync(t as 'ed25519'); return kp.privateKey.export({ type: 'pkcs8', format: 'pem' }) + '\n' + kp.publicKey.export({ type: 'spki', format: 'pem' }) } },
  { id: 'sign', group: 'Criptografia', label: 'Assinar mensagem (PEM)', description: 'Assina com chave privada PEM (Ed25519/RSA/EC). Saída base64', input: 'Mensagem', params: [{ name: 'key', label: 'Chave privada PEM', type: 'textarea' }], run: (i, p) => { const k = nc.createPrivateKey(p.key ?? ''); const alg = k.asymmetricKeyType === 'ed25519' || k.asymmetricKeyType === 'ed448' ? null : 'sha256'; return nc.sign(alg, Buffer.from(i), k).toString('base64') } },
  { id: 'verify', group: 'Criptografia', label: 'Verificar assinatura (PEM)', description: 'Verifica assinatura base64 com chave pública PEM', input: 'Mensagem', params: [{ name: 'key', label: 'Chave pública PEM', type: 'textarea' }, { name: 'sig', label: 'Assinatura (base64)', type: 'text' }], run: (i, p) => { const k = nc.createPublicKey(p.key ?? ''); const alg = k.asymmetricKeyType === 'ed25519' || k.asymmetricKeyType === 'ed448' ? null : 'sha256'; return nc.verify(alg, Buffer.from(i), k, Buffer.from(p.sig ?? '', 'base64')) ? '✔ assinatura VÁLIDA' : '✘ assinatura INVÁLIDA' } },

  // ── Cifras clássicas / comunicação ──
  { id: 'morse.encode', group: 'Comunicação', label: 'Morse ← texto', description: 'Para rádio, lanterna ou batidas. SOS = ... --- ...', input: 'Texto', run: (i) => i.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(' ').map((w) => [...w].map((c) => MORSE[c] ?? '').filter(Boolean).join(' ')).join(' / ') },
  { id: 'morse.decode', group: 'Comunicação', label: 'Morse → texto', description: 'Letras separadas por espaço, palavras por /', input: 'Morse', run: (i) => i.trim().split(/\s*\/\s*/).map((w) => w.split(/\s+/).map((c) => MORSE_REV[c] ?? '?').join('')).join(' ') },
  { id: 'nato', group: 'Comunicação', label: 'Alfabeto fonético (NATO)', description: 'Soletrar no rádio: A → Alfa', input: 'Texto', run: (i) => [...i.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()].map((c) => (c >= 'A' && c <= 'Z' ? NATO[c.charCodeAt(0) - 65] : c === ' ' ? '·' : c)).join(' ') },
  { id: 'rot13', group: 'Comunicação', label: 'ROT13', description: 'Cifra simétrica trivial', input: 'Texto', run: (i) => shift(i, 13) },
  { id: 'caesar', group: 'Comunicação', label: 'Cifra de César', description: 'Desloca letras N posições', input: 'Texto', params: [{ name: 'n', label: 'Deslocamento', type: 'number', default: '3' }], run: (i, p) => shift(i, Number(p.n || 3)) },

  // ── Utilidades ──
  { id: 'jwt.decode', group: 'Utilidades', label: 'Decodificar JWT', description: 'Mostra header e payload (não valida assinatura)', input: 'JWT', run: (i) => { const [h, pl] = i.trim().split('.'); const d = (s: string) => JSON.stringify(JSON.parse(Buffer.from(s, 'base64url').toString('utf8')), null, 2); const payload = JSON.parse(Buffer.from(pl, 'base64url').toString('utf8')); const exp = payload.exp ? `\n\nexpira: ${new Date(payload.exp * 1000).toISOString()}` : ''; return `HEADER\n${d(h)}\n\nPAYLOAD\n${d(pl)}${exp}` } },
  { id: 'json.format', group: 'Utilidades', label: 'Formatar/validar JSON', description: 'Indenta e valida', input: 'JSON', params: [{ name: 'mode', label: 'Modo', type: 'select', options: ['bonito', 'compacto'], default: 'bonito' }], run: (i, p) => JSON.stringify(JSON.parse(i), null, p.mode === 'compacto' ? 0 : 2) },
  { id: 'uuid', group: 'Utilidades', label: 'Gerar UUID v4', description: 'Identificadores aleatórios', params: [{ name: 'n', label: 'Quantidade', type: 'number', default: '5' }], run: (_i, p) => Array.from({ length: Math.min(100, Number(p.n || 5)) }, () => nc.randomUUID()).join('\n') },
  { id: 'random.password', group: 'Utilidades', label: 'Gerar senha forte', description: 'Senha aleatória com CSPRNG', params: [{ name: 'len', label: 'Tamanho', type: 'number', default: '24' }, { name: 'set', label: 'Caracteres', type: 'select', options: ['completo', 'alfanumérico', 'só números (PIN)', 'diceware-like (palavras)'], default: 'completo' }], run: (_i, p) => { const len = Math.min(256, Number(p.len || 24)); if (p.set?.startsWith('diceware')) { const syl = ['ba', 'ce', 'di', 'fo', 'gu', 'la', 'me', 'ni', 'po', 'ru', 'sa', 'te', 'vi', 'zo', 'ma', 'pe', 'lu', 'ro', 'ta', 'ne']; return Array.from({ length: Math.max(4, Math.round(len / 4)) }, () => Array.from({ length: 3 }, () => syl[nc.randomInt(syl.length)]).join('')).join('-') } const sets: Record<string, string> = { completo: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_=+?', alfanumérico: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', 'só números (PIN)': '0123456789' }; const cs = sets[p.set ?? 'completo'] ?? sets.completo; return Array.from({ length: len }, () => cs[nc.randomInt(cs.length)]).join('') } },
  { id: 'random.bytes', group: 'Utilidades', label: 'Bytes aleatórios', description: 'Entropia do CSPRNG em hex', params: [{ name: 'n', label: 'Bytes', type: 'number', default: '32' }], run: (_i, p) => nc.randomBytes(Math.min(1024, Number(p.n || 32))).toString('hex') },
  { id: 'timestamp', group: 'Utilidades', label: 'Timestamp ⇄ data', description: 'Unix (s ou ms) para data, ou data ISO para Unix', input: 'Timestamp ou data', run: (i) => { const s = i.trim(); if (/^\d+$/.test(s)) { const n = Number(s); const d = new Date(s.length > 11 ? n : n * 1000); return `UTC:   ${d.toISOString()}\nlocal: ${d.toLocaleString('pt-BR')}` } const d = new Date(s); if (isNaN(+d)) throw new Error('data inválida'); return `unix (s):  ${Math.floor(+d / 1000)}\nunix (ms): ${+d}` } },
  { id: 'text.stats', group: 'Utilidades', label: 'Estatísticas de texto', description: 'Caracteres, palavras, linhas, bytes', input: 'Texto', run: (i) => `caracteres: ${[...i].length}\npalavras: ${i.trim() ? i.trim().split(/\s+/).length : 0}\nlinhas: ${i.split('\n').length}\nbytes UTF-8: ${enc.encode(i).length}` },
]

export function listOps() {
  return OPS.map(({ run: _run, ...meta }) => meta)
}

export async function runOp(id: string, input: string, params: Record<string, string> = {}) {
  const op = OPS.find((o) => o.id === id)
  if (!op) throw new Error(`operação desconhecida: ${id}`)
  const defaults = Object.fromEntries((op.params ?? []).filter((p) => p.default != null).map((p) => [p.name, p.default!]))
  return op.run(input ?? '', { ...defaults, ...params })
}
