import { ArrowsLeftRight, ClockCounterClockwise, SpeakerHigh, Stop, Translate as TranslateIcon, Trash, X } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, cn, CopyButton, PageHeader, Select, Spinner, Textarea } from '../components/ui'
import { sse } from '../lib/api'

const LANGS = [
  { code: 'pt', label: 'Português', voice: 'pt-BR' },
  { code: 'en', label: 'Inglês', voice: 'en-US' },
  { code: 'es', label: 'Espanhol', voice: 'es-ES' },
  { code: 'it', label: 'Italiano', voice: 'it-IT' },
  { code: 'fr', label: 'Francês', voice: 'fr-FR' },
  { code: 'de', label: 'Alemão', voice: 'de-DE' },
] as const
type Code = (typeof LANGS)[number]['code']
type From = Code | 'auto'
type Tone = 'neutral' | 'formal' | 'informal'
type Hist = { from: Code; to: Code; src: string; out: string; at: number }

const label = (c: string) => LANGS.find((l) => l.code === c)?.label ?? c
const MAX = 6000
const HKEY = 'arca.translate.history'
const PKEY = 'arca.translate.prefs'
const load = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '') ?? d
  } catch {
    return d
  }
}
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {}
}

function LangPicker({ value, onChange, auto, detected }: { value: string; onChange: (c: any) => void; auto?: boolean; detected?: string | null }) {
  const items = [...(auto ? [{ code: 'auto', label: detected ? `Detectado: ${label(detected)}` : 'Detectar' }] : []), ...LANGS]
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((l) => (
        <button
          key={l.code}
          onClick={() => onChange(l.code)}
          className={cn(
            'rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors',
            value === l.code ? 'bg-gold/15 text-gold ring-1 ring-gold/30' : 'text-fg-2 hover:bg-overlay hover:text-fg'
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

function speak(text: string, code: string) {
  if (!('speechSynthesis' in window)) return toast.error('Este navegador não tem leitura em voz alta')
  const voice = LANGS.find((l) => l.code === code)?.voice ?? 'pt-BR'
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = voice
  const v = speechSynthesis.getVoices().find((x) => x.lang.replace('_', '-').startsWith(voice.slice(0, 2)) && x.localService)
  if (v) u.voice = v
  speechSynthesis.speak(u)
}

export default function Translate() {
  const prefs = load<{ from: From; to: Code; tone: Tone }>(PKEY, { from: 'auto', to: 'en', tone: 'neutral' })
  const [from, setFrom] = useState<From>(prefs.from)
  const [to, setTo] = useState<Code>(prefs.to)
  const [tone, setTone] = useState<Tone>(prefs.tone)
  const [src, setSrc] = useState('')
  const [out, setOut] = useState('')
  const [detected, setDetected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [same, setSame] = useState(false)
  const [hist, setHist] = useState<Hist[]>(() => load(HKEY, []))
  const ac = useRef<AbortController | null>(null)

  useEffect(() => save(PKEY, { from, to, tone }), [from, to, tone])
  useEffect(() => setDetected(null), [src, from])

  const run = async () => {
    const text = src.trim()
    if (!text || busy) return
    if (from === to) return toast.error('Escolha idiomas diferentes')
    ac.current?.abort()
    const ctrl = new AbortController()
    ac.current = ctrl
    setBusy(true)
    setOut('')
    setStatus('')
    setSame(false)
    let acc = ''
    let lang: string | null = null
    try {
      await sse(
        '/api/translate',
        { text, from, to, tone },
        (e) => {
          if (e.type === 'lang') setDetected((lang = e.code))
          else if (e.type === 'delta') (setStatus(''), setOut((acc += e.text)))
          else if (e.type === 'status') setStatus(e.text)
          else if (e.type === 'same') setSame(true)
          else if (e.type === 'error') throw new Error(e.message)
        },
        ctrl.signal
      )
      const f = (from === 'auto' ? lang : from) as Code | null
      if (acc.trim() && f && f in Object.fromEntries(LANGS.map((l) => [l.code, 1]))) {
        const h = [{ from: f, to, src: text, out: acc.trim(), at: Date.now() }, ...hist.filter((x) => x.src !== text || x.to !== to)].slice(0, 30)
        setHist(h)
        save(HKEY, h)
      }
    } catch (e) {
      if (!ctrl.signal.aborted) toast.error((e as Error).message.includes('HTTP') ? 'A IA não respondeu. Ela está ligada? (veja em Sistema)' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const stop = () => {
    ac.current?.abort()
    setBusy(false)
  }
  const swap = () => {
    const newFrom = (from === 'auto' ? detected : from) as Code | null
    if (!newFrom) return setTo(to)
    setFrom(to)
    setTo(newFrom)
    if (out) {
      setSrc(out)
      setOut('')
    }
  }

  return (
    <div>
      <PageHeader
        icon={<TranslateIcon weight="duotone" className="size-6" />}
        eyebrow="Conhecimento"
        title="Tradutor"
        subtitle="Português, inglês, espanhol, italiano, francês e alemão — traduzido pela IA local, sem internet."
      />
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-6 md:px-8">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-[1fr_auto_1fr]">
            {/* origem */}
            <div className="flex min-w-0 flex-col">
              <div className="border-b border-line px-4 py-2.5">
                <LangPicker value={from} onChange={setFrom} auto detected={from === 'auto' ? detected : null} />
              </div>
              <div className="relative flex-1">
                <Textarea
                  autoFocus
                  value={src}
                  maxLength={MAX}
                  onChange={(e) => setSrc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      run()
                    }
                  }}
                  placeholder="Digite ou cole o texto…"
                  className="min-h-[260px] w-full resize-none rounded-none border-0 bg-transparent px-4 py-3 text-[15px] focus:ring-0"
                />
                {src && (
                  <button onClick={() => (setSrc(''), setOut(''))} className="absolute top-3 right-3 rounded p-1 text-fg-3 hover:bg-overlay hover:text-fg" title="Limpar">
                    <X />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-line px-4 py-2">
                <button disabled={!src} onClick={() => speak(src, from === 'auto' ? (detected ?? 'pt') : from)} className="rounded p-1.5 text-fg-3 hover:bg-overlay hover:text-fg disabled:opacity-30" title="Ouvir">
                  <SpeakerHigh className="size-[18px]" />
                </button>
                <span className="text-xs whitespace-nowrap text-fg-3 tabular-nums">
                  {src.length.toLocaleString('pt-BR')} / {MAX.toLocaleString('pt-BR')}
                </span>
                <Select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className="ml-auto h-8 !w-32 shrink-0 py-0 text-xs">
                  <option value="neutral">Tom neutro</option>
                  <option value="formal">Formal</option>
                  <option value="informal">Informal</option>
                </Select>
                {busy ? (
                  <Button size="sm" variant="ghost" onClick={stop}>
                    <Stop weight="fill" /> Parar
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" disabled={!src.trim()} onClick={run} title="⌘/Ctrl + Enter">
                    Traduzir
                  </Button>
                )}
              </div>
            </div>

            {/* trocar */}
            <div className="flex items-center justify-center border-y border-line py-1 md:border-x md:border-y-0 md:px-1 md:py-0">
              <button onClick={swap} disabled={from === 'auto' && !detected} className="rounded-full p-2 text-fg-2 hover:bg-overlay hover:text-gold disabled:opacity-30" title="Inverter idiomas">
                <ArrowsLeftRight className="size-5 rotate-90 md:rotate-0" />
              </button>
            </div>

            {/* destino */}
            <div className="flex min-w-0 flex-col bg-elevated/40">
              <div className="border-b border-line px-4 py-2.5">
                <LangPicker value={to} onChange={setTo} />
              </div>
              <div className="min-h-[260px] flex-1 px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
                {out ||
                  (busy ? (
                    <span className="flex items-center gap-2 text-sm text-fg-3">
                      <Spinner className="size-4" /> {status || 'Traduzindo…'}
                    </span>
                  ) : same ? (
                    <span className="text-sm text-fg-2">O texto já está em {label(to)}. Escolha outro idioma de destino acima.</span>
                  ) : (
                    <span className="text-fg-3">A tradução aparece aqui.</span>
                  ))}
                {busy && out && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-gold/70 align-middle" />}
              </div>
              <div className="flex items-center gap-2 border-t border-line px-4 py-2">
                <button disabled={!out} onClick={() => speak(out, to)} className="rounded p-1.5 text-fg-3 hover:bg-overlay hover:text-fg disabled:opacity-30" title="Ouvir">
                  <SpeakerHigh className="size-[18px]" />
                </button>
                <span className="text-xs text-fg-3">IA local · confira termos críticos (remédios, doses)</span>
                <div className="ml-auto">{out && !busy && <CopyButton text={out} />}</div>
              </div>
            </div>
          </div>
        </Card>

        {hist.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-fg-3 uppercase">
              <ClockCounterClockwise className="size-4" /> Recentes
              <button onClick={() => (setHist([]), save(HKEY, []))} className="ml-auto flex items-center gap-1 font-normal tracking-normal normal-case hover:text-err">
                <Trash /> limpar
              </button>
            </div>
            <Card className="divide-y divide-line">
              {hist.slice(0, 10).map((h) => (
                <button
                  key={h.at}
                  onClick={() => {
                    setFrom(h.from)
                    setTo(h.to)
                    setSrc(h.src)
                    setTimeout(() => setOut(h.out))
                  }}
                  className="grid w-full gap-1 px-4 py-2.5 text-left text-[13px] hover:bg-elevated md:grid-cols-[110px_1fr_1fr] md:gap-4"
                >
                  <span className="text-[11px] font-semibold text-fg-3">
                    {h.from.toUpperCase()} → {h.to.toUpperCase()}
                  </span>
                  <span className="truncate text-fg-2">{h.src}</span>
                  <span className="truncate">{h.out}</span>
                </button>
              ))}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
