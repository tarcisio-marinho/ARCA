// Tipos e utilitários da área de Vídeos (mini YouTube offline).
export type Seg = [number, number, string] // início (s), fim (s), texto
export type VideoItem = {
  id: string
  channel: string
  channelTitle: string
  title: string
  date: string | null
  duration: number | null
  hasThumb: boolean
  subLang: string | null
  words: number
  thumb: string | null
  src: string
}
export type VideoDetail = VideoItem & { description: string | null; url: string | null; docId: number | null; segments: Seg[] }
export type VideoSnippet = { t: number; text: string; hl: [number, number][] }
export type VideoHit = { id: string; channel: string; title: string; date: string | null; duration: number | null; thumb: string | null; count: number; titleMatch: boolean; snippets: VideoSnippet[] }
export type VideoFind = { query: string; mode: 'phrase' | 'words'; total: number; videos: number; hits: VideoHit[]; ms: number }

export const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
export const parseTime = (s: string) => s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0)

export const fmtVideoDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ de /g, ' ').replace('.', '') : '')

export const videoLink = (id: string, t?: number, q?: string) => {
  const p = new URLSearchParams()
  if (t != null && t > 0) p.set('t', String(Math.floor(t)))
  if (q) p.set('q', q)
  const qs = p.toString()
  return `/videos/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`
}

/** Igual ao servidor: sem acento, minúsculo, espaços colapsados — guardando o mapa para o texto original. */
export function foldMap(text: string) {
  let folded = ''
  const map: number[] = []
  let lastSpace = true
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      if (!lastSpace) {
        folded += ' '
        map.push(i)
      }
      lastSpace = true
      continue
    }
    for (const ch of text[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()) {
      folded += ch
      map.push(i)
    }
    lastSpace = false
  }
  return { folded, map }
}
export const foldQuery = (s: string) => foldMap(s.trim()).folded.trim()

/** Índice da fala em andamento no tempo t (busca binária nos inícios). */
export function segAt(segs: Seg[], t: number) {
  let lo = 0
  let hi = segs.length - 1
  if (hi < 0 || t < segs[0][0]) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segs[mid][0] <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}
