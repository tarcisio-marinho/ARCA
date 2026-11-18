export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const r = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { 'content-type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const text = await r.text()
  const data = text ? JSON.parse(text) : null
  if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`)
  return data as T
}

export const post = <T = any>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} })
export const put = <T = any>(path: string, json?: unknown) => api<T>(path, { method: 'PUT', json })
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' })

/** POST que devolve Server-Sent Events (chat da IA). */
export async function sse(path: string, body: unknown, onEvent: (e: any) => void, signal?: AbortSignal) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i)
      buf = buf.slice(i + 2)
      for (const line of chunk.split('\n')) if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)))
    }
  }
}

export const fmtBytes = (n: number) => {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${u[i]}`
}
export const fmtNum = (n: number, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d })
export const fmtSats = (s: number) => `${(s / 1e8).toLocaleString('pt-BR', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC`
export const fmtDate = (d: string | Date) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
export const timeAgo = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return `há ${Math.floor(s / 86400)} d`
}
