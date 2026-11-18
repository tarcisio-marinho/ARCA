// Legendas WebVTT → transcrição limpa. As auto-legendas do YouTube vêm em "rolagem": cada cue repete a
// linha anterior e traz a nova com tags de tempo por palavra (<00:00:01.280><c> palavra</c>). Aqui tiramos
// as tags, descartamos as linhas repetidas e ficamos com um segmento por fala nova.

/** [início (s), fim (s), texto] — formato compacto, também é o que vai pro banco (JSONB). */
export type Seg = [number, number, string]

function ts(s: string): number {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/)
  if (!m) return NaN
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000
}

const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'" }
const clean = (l: string) =>
  l
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|nbsp|quot|#39);/g, (e) => ENT[e])
    .replace(/^\s*-\s+/, '') // travessão de diálogo das legendas manuais
    .replace(/\s+/g, ' ')
    .trim()

export function parseVtt(src: string): Seg[] {
  const out: Seg[] = []
  const recent: string[] = [] // últimas linhas emitidas (para cortar a rolagem)
  for (const block of src.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const [a, b] = lines[i].split('-->')
    const start = ts(a)
    const end = ts(b.trim().split(/\s+/)[0])
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const fresh: string[] = []
    for (const raw of lines.slice(i + 1)) {
      const t = clean(raw)
      if (!t) continue
      const key = t.toLowerCase()
      if (recent.includes(key)) continue
      fresh.push(t)
      recent.push(key)
      if (recent.length > 2) recent.shift()
    }
    if (fresh.length) out.push([start, Math.max(start, end), fresh.join(' ')])
  }
  out.sort((x, y) => x[0] - y[0])
  // fim de um segmento não passa do começo do próximo
  for (let k = 0; k < out.length - 1; k++) if (out[k][1] > out[k + 1][0]) out[k][1] = Math.max(out[k][0], out[k + 1][0])
  return out.map(([s, e, t]) => [Math.round(s * 100) / 100, Math.round(e * 100) / 100, t])
}

export type TimedChunk = { start: number; end: number; text: string }

/** Agrupa segmentos em trechos de ~30–60 s (alvo 45 s), cortando sempre entre falas. */
export function chunkSegments(segs: Seg[], opts = { min: 30, target: 45, max: 60 }): TimedChunk[] {
  const out: TimedChunk[] = []
  let cur: Seg[] = []
  const flush = () => {
    if (cur.length) out.push({ start: cur[0][0], end: cur[cur.length - 1][1], text: cur.map((s) => s[2]).join(' ') })
    cur = []
  }
  for (const s of segs) {
    if (cur.length) {
      const dur = cur[cur.length - 1][1] - cur[0][0]
      const withNext = s[1] - cur[0][0]
      const gap = s[0] - cur[cur.length - 1][1]
      if (dur >= opts.target || (withNext > opts.max && dur >= opts.min) || (gap > 8 && dur >= opts.min)) flush()
    }
    cur.push(s)
  }
  // sobra curtinha no fim: junta com o anterior
  if (cur.length && out.length && cur[cur.length - 1][1] - cur[0][0] < 15) {
    const last = out[out.length - 1]
    last.end = cur[cur.length - 1][1]
    last.text += ' ' + cur.map((s) => s[2]).join(' ')
    cur = []
  }
  flush()
  return out
}

export const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Gera um VTT limpo (1 cue por segmento) para a legenda sobre o vídeo. */
export function toVtt(segs: Seg[]): string {
  const f = (x: number) => {
    const ms = Math.round(x * 1000)
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
  }
  const lines = ['WEBVTT', '']
  segs.forEach(([s, e, t], i) => {
    // cue curto demais (fala rápida) some antes de dar pra ler: segura pelo menos 1,5 s sem invadir o próximo
    const next = segs[i + 1]?.[0] ?? e + 2
    const end = Math.min(Math.max(e, s + 1.5), Math.max(next, s + 0.5))
    lines.push(`${f(s)} --> ${f(end)}`, t, '')
  })
  return lines.join('\n')
}
