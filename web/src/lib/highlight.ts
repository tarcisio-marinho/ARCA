// Destaca um termo (sem acento/maiúscula) dentro de um elemento já renderizado — usado ao abrir
// um guia a partir da busca. Devolve a quantidade de marcas e rola até a primeira.
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function highlightIn(root: HTMLElement, term: string): HTMLElement[] {
  root.querySelectorAll('mark[data-find]').forEach((m) => m.replaceWith(document.createTextNode(m.textContent ?? '')))
  root.normalize()
  const needle = fold(term.trim()).replace(/\s+/g, ' ')
  if (needle.length < 2) return []
  const marks: HTMLElement[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const text = node.data
    // fold char a char para manter o mapeamento de posições
    let folded = ''
    const map: number[] = []
    for (let i = 0; i < text.length; i++) {
      const f = /\s/.test(text[i]) ? ' ' : fold(text[i])
      for (const ch of f) {
        folded += ch
        map.push(i)
      }
    }
    const found: [number, number][] = []
    let p = folded.indexOf(needle)
    while (p >= 0) {
      found.push([map[p], map[p + needle.length - 1] + 1])
      p = folded.indexOf(needle, p + needle.length)
    }
    if (!found.length) continue
    const frag = document.createDocumentFragment()
    let last = 0
    for (const [s, e] of found) {
      frag.append(text.slice(last, s))
      const m = document.createElement('mark')
      m.dataset.find = '1'
      m.className = 'find-mark'
      m.textContent = text.slice(s, e)
      frag.append(m)
      marks.push(m)
      last = e
    }
    frag.append(text.slice(last))
    node.replaceWith(frag)
  }
  return marks
}
