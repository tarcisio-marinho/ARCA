import { ArrowsClockwise, ChefHat, MagnifyingGlass, Play, QrCode, Toolbox } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import QR from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, cn, CopyButton, Field, Input, PageHeader, Select, Tabs, Textarea } from '../components/ui'
import { api, post } from '../lib/api'

type Param = { name: string; label: string; type: string; options?: string[]; default?: string }
type Op = { id: string; group: string; label: string; description: string; input?: string; params?: Param[] }

function QrTool() {
  const [text, setText] = useState('')
  const [svg, setSvg] = useState('')
  useEffect(() => {
    if (!text) return setSvg('')
    QR.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000', light: '#fff' } })
      .then(setSvg)
      .catch((e) => setSvg(`<p style="color:#ef4444">${e.message}</p>`))
  }, [text])
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Field label="Texto, endereço, transação ou PSBT" hint="QR comporta ~2.900 bytes. Útil para passar dados entre dispositivos sem rede (air-gap).">
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[13px]" />
      </Field>
      <div className="flex items-center justify-center rounded-2xl border border-line bg-base p-6">
        {svg ? <div className="w-full max-w-[320px] overflow-hidden rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: svg }} /> : <QrCode className="size-16 text-fg-3" />}
      </div>
    </div>
  )
}

export default function Tools() {
  const [tab, setTab] = useState<'kit' | 'qr' | 'chef'>('kit')
  const { data: ops } = useQuery({ queryKey: ['ops'], queryFn: () => api<Op[]>('/api/tools') })
  const [sel, setSel] = useState('hash')
  const [filter, setFilter] = useState('')
  const [input, setInput] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null)
  const [running, setRunning] = useState(false)
  const op = ops?.find((o) => o.id === sel)

  useEffect(() => {
    setParams(Object.fromEntries((op?.params ?? []).map((p) => [p.name, p.default ?? (p.options?.[0] ?? '')])))
    setOut(null)
  }, [sel, op])

  const groups = useMemo(() => {
    const g = new Map<string, Op[]>()
    for (const o of ops ?? []) if (!filter || (o.label + o.description).toLowerCase().includes(filter.toLowerCase())) g.set(o.group, [...(g.get(o.group) ?? []), o])
    return [...g.entries()]
  }, [ops, filter])

  const run = async () => {
    if (!op) return
    setRunning(true)
    try {
      const r = await post('/api/tools/run', { op: op.id, input, params })
      setOut({ ok: true, text: r.output })
    } catch (e) {
      setOut({ ok: false, text: (e as Error).message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Toolbox weight="duotone" className="size-6" />}
        eyebrow="Tecnologia"
        title="Ferramentas"
        subtitle="Codificação, hashes, criptografia, chaves e comunicação — tudo local."
        actions={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'kit', label: 'Kit Arca', icon: <Toolbox /> },
              { value: 'qr', label: 'QR Code', icon: <QrCode /> },
              { value: 'chef', label: 'CyberChef', icon: <ChefHat /> },
            ]}
          />
        }
      />
      {tab === 'chef' ? (
        <iframe src="/cyberchef/" className="min-h-0 flex-1 bg-white" title="CyberChef" />
      ) : tab === 'qr' ? (
        <div className="mx-auto w-full max-w-5xl p-6 md:p-8">
          <QrTool />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-r border-line p-3 md:block">
            <div className="relative mb-3">
              <MagnifyingGlass className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar…" className="h-9 pl-9" />
            </div>
            {groups.map(([g, list]) => (
              <div key={g} className="mb-4">
                <div className="mb-1 px-2 text-[10.5px] font-semibold tracking-[0.14em] text-fg-3 uppercase">{g}</div>
                {list.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setSel(o.id)}
                    className={cn('block w-full rounded-[9px] px-2.5 py-1.5 text-left text-[13px]', sel === o.id ? 'bg-elevated text-fg ring-1 ring-gold/25' : 'text-fg-2 hover:bg-[#151515] hover:text-fg')}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ))}
          </aside>
          <section className="min-w-0 flex-1 overflow-y-auto">
            {op && (
              <div className="mx-auto max-w-4xl space-y-5 p-6 md:p-8">
                <Select className="md:hidden" value={sel} onChange={(e) => setSel(e.target.value)}>
                  {ops?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.group} · {o.label}
                    </option>
                  ))}
                </Select>
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.14em] text-gold uppercase">{op.group}</div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">{op.label}</h2>
                  <p className="text-sm text-fg-2">{op.description}</p>
                </div>
                {op.input && (
                  <Field label={op.input}>
                    <Textarea
                      rows={6}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && run()}
                      className="font-mono text-[13px]"
                    />
                  </Field>
                )}
                {!!op.params?.length && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {op.params.map((p) => (
                      <Field key={p.name} label={p.label} className={p.type === 'textarea' ? 'sm:col-span-2' : ''}>
                        {p.type === 'select' ? (
                          <Select value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}>
                            {p.options!.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </Select>
                        ) : p.type === 'textarea' ? (
                          <Textarea rows={5} className="font-mono text-[12px]" value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })} />
                        ) : (
                          <Input type={p.type === 'password' ? 'password' : p.type === 'number' ? 'number' : 'text'} value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })} />
                        )}
                      </Field>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="primary" onClick={run} loading={running}>
                    <Play weight="fill" /> Executar
                  </Button>
                  {out?.ok && (
                    <Button variant="dark" onClick={() => setInput(out.text)} title="Usar a saída como nova entrada">
                      <ArrowsClockwise /> Saída → entrada
                    </Button>
                  )}
                </div>
                {out && (
                  <Card className={cn('p-0', !out.ok && 'border-err/30')}>
                    <div className="flex items-center justify-between border-b border-line px-4 py-2">
                      <span className={cn('text-xs font-semibold', out.ok ? 'text-ok' : 'text-err')}>{out.ok ? 'Resultado' : 'Erro'}</span>
                      {out.ok && <CopyButton text={out.text} />}
                    </div>
                    <pre className="max-h-[420px] overflow-auto p-4 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap">{out.text}</pre>
                  </Card>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
