/** Texto com trechos destacados (offsets [início, fim) vindos da busca). */
export function Highlighted({ s }: { s: { text: string; hl: [number, number][] } }) {
  const parts: React.ReactNode[] = []
  let last = 0
  s.hl.forEach(([a, b], i) => {
    if (a < last) return
    parts.push(s.text.slice(last, a))
    parts.push(
      <mark key={i} className="find-mark">
        {s.text.slice(a, b)}
      </mark>
    )
    last = b
  })
  parts.push(s.text.slice(last))
  return <>{parts}</>
}
