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
          // marca citações [D1] / [W3] como chips clicáveis
          p: ({ children }) => <p>{onCite ? cite(children, onCite) : children}</p>,
          li: ({ children }) => <li>{onCite ? cite(children, onCite) : children}</li>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

function cite(children: any, onCite: (r: string) => void): any {
  const map = (c: any, i: number): any => {
    if (typeof c !== 'string') return c
    const parts = c.split(/(\[[DW]\d+\])/g)
    return parts.map((p, j) =>
      /^\[[DW]\d+\]$/.test(p) ? (
        <button
          key={`${i}-${j}`}
          onClick={() => onCite(p.slice(1, -1))}
          className="mx-0.5 inline-flex -translate-y-px items-center rounded-md border border-gold/25 bg-gold/10 px-1.5 text-[11px] leading-[18px] font-bold text-gold hover:bg-gold/20"
        >
          {p.slice(1, -1)}
        </button>
      ) : (
        p
      )
    )
  }
  return Array.isArray(children) ? children.map(map) : map(children, 0)
}
