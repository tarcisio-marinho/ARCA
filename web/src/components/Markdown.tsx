import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

const text = (children: any): string => (Array.isArray(children) ? children.map(text).join('') : typeof children === 'string' ? children : children?.props ? text(children.props.children) : '')

/** Markdown com ids nos títulos (para índice) e links externos abrindo em nova aba. */
export function Markdown({ children, onCite }: { children: string; onCite?: (ref: string) => void }) {
  return (
    <div className="prose-arca">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 id={slugify(text(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={slugify(text(children))}>{children}</h3>,
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
              {children}
            </a>
          ),
          // marca citações [D1] / [W3] / [V1 12:34] como chips clicáveis
          p: ({ children }) => <p>{onCite ? cite(children, onCite) : children}</p>,
          li: ({ children }) => <li>{onCite ? cite(children, onCite) : children}</li>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

const CITE = /(\[(?:[DW]\d+|V\d+(?: \d{1,2}:\d{2}(?::\d{2})?)?)\])/g
const CITE_ONE = /^\[([DW]\d+|V\d+)(?: (\d{1,2}:\d{2}(?::\d{2})?))?\]$/

function cite(children: any, onCite: (r: string) => void): any {
  const map = (c: any, i: number): any => {
    if (typeof c !== 'string') return c
    const parts = c.split(CITE)
    return parts.map((p, j) => {
      const m = p.match(CITE_ONE)
      if (!m) return p
      const [, ref, time] = m
      return (
        <button
          key={`${i}-${j}`}
          onClick={() => onCite(ref)}
          title={time ? `Abrir o vídeo em ${time}` : undefined}
          className="mx-0.5 inline-flex -translate-y-px items-center gap-1 rounded-md border border-gold/25 bg-gold/10 px-1.5 text-[11px] leading-[18px] font-bold text-gold hover:bg-gold/20"
        >
          {ref.startsWith('V') && <span aria-hidden>▶</span>}
          {ref}
          {time && <span className="font-mono font-semibold">{time}</span>}
        </button>
      )
    })
  }
  return Array.isArray(children) ? children.map(map) : map(children, 0)
}
