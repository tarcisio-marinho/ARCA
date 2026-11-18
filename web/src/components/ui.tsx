import { CircleNotch, Copy, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export const cn = clsx

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger'
export function Button({
  variant = 'dark',
  size = 'md',
  loading,
  className,
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 font-semibold whitespace-nowrap transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' && 'h-8 rounded-[9px] px-3 text-[13px]',
        size === 'md' && 'h-10 rounded-[10px] px-4 text-sm',
        size === 'lg' && 'h-12 rounded-2xl px-6 text-[15px]',
        variant === 'primary' && 'bg-gold-grad text-gold-ink hover:opacity-95 hover:glow-gold',
        variant === 'secondary' && 'border border-gold/25 text-gold hover:border-gold hover:bg-gold/10',
        variant === 'ghost' && 'text-fg-2 hover:bg-overlay hover:text-fg',
        variant === 'dark' && 'border border-line-2 bg-surface text-fg hover:border-line-3 hover:bg-elevated',
        variant === 'danger' && 'border border-err/25 bg-err/10 text-err hover:bg-err/15',
        className
      )}
    >
      {loading && <CircleNotch className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Card({ className, children, gold, ...p }: { className?: string; children: ReactNode; gold?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cn('overflow-hidden rounded-2xl border border-line bg-surface', gold && 'card-gold', className)}>
      {children}
    </div>
  )
}

type Tone = 'gold' | 'ok' | 'err' | 'warn' | 'info' | 'neutral'
const toneCls: Record<Tone, string> = {
  gold: 'text-gold bg-gold/10 border-gold/20',
  ok: 'text-ok bg-ok/10 border-ok/20',
  err: 'text-err bg-err/10 border-err/20',
  warn: 'text-warn bg-warn/10 border-warn/20',
  info: 'text-info bg-info/10 border-info/20',
  neutral: 'text-fg-2 bg-elevated border-line-2',
}
export function Badge({ tone = 'neutral', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide', toneCls[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const field = 'w-full rounded-[10px] border border-line-2 bg-base px-3 text-sm text-fg placeholder:text-fg-3 outline-none transition focus:border-gold/60 focus:ring-2 focus:ring-gold/15'
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(field, 'h-10', className)} />
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(field, 'py-2.5 leading-relaxed', className)} />
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cn(field, 'h-10 appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.5'/%3E%3C/svg%3E\")" }}>
    {children}
  </select>
)

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-semibold text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-fg-3">{hint}</span>}
    </label>
  )
}

export function PageHeader({ icon, title, subtitle, actions, eyebrow }: { icon?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-6 pt-7 pb-5 md:px-8">
      <div className="flex min-w-0 items-center gap-4">
        {icon && <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-gold-subtle text-gold">{icon}</div>}
        <div className="min-w-0">
          {eyebrow && <div className="mb-0.5 text-[11px] font-semibold tracking-[0.14em] text-gold uppercase">{eyebrow}</div>}
          <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.03em]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-fg-2">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export const Spinner = ({ className }: { className?: string }) => <CircleNotch className={cn('size-5 animate-spin text-gold', className)} />

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-line-2 bg-elevated text-fg-3">{icon}</div>
      <div className="font-semibold">{title}</div>
      {children && <div className="max-w-md text-sm text-fg-2">{children}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm md:items-center" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className={cn('card-gold w-full rounded-2xl border border-line-2 bg-surface shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-fg-3 hover:bg-overlay hover:text-fg">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; icon?: ReactNode }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-base p-1">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition',
            value === i.value ? 'bg-elevated text-fg shadow-sm ring-1 ring-line-2' : 'text-fg-3 hover:text-fg-2'
          )}
        >
          {i.icon}
          {i.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'gold' | 'ok' | 'warn' | 'err' }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">{label}</span>
        {icon && <span className={cn('text-fg-3', tone === 'gold' && 'text-gold', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', tone === 'err' && 'text-err')}>{icon}</span>}
      </div>
      <div className="mt-2 font-display text-[28px] leading-none font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-2 text-xs text-fg-2">{hint}</div>}
    </Card>
  )
}

export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          const t = document.createElement('textarea')
          t.value = text
          document.body.appendChild(t)
          t.select()
          document.execCommand('copy')
          t.remove()
        }
        const { toast } = await import('sonner')
        toast.success('Copiado')
      }}
    >
      {label || <Copy className="size-4" />}
    </Button>
  )
}
