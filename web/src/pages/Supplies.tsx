import { Backpack, Drop, ForkKnife, Minus, PencilSimple, Plus, Trash, UsersThree } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge, Button, Card, cn, Empty, Field, Input, Modal, PageHeader, Select, Stat, Textarea } from '../components/ui'
import { api, del, fmtNum, post, put } from '../lib/api'

const CATS: Record<string, string> = { agua: 'Água', comida: 'Comida', remedio: 'Remédio', higiene: 'Higiene', energia: 'Energia', ferramenta: 'Ferramenta', outro: 'Outro' }
// atalhos com kcal típicas por unidade para cadastro rápido
const PRESETS = [
  { name: 'Galão de água 5 L', category: 'agua', unit: 'galão', litersPerUnit: 5 },
  { name: 'Garrafão 20 L', category: 'agua', unit: 'garrafão', litersPerUnit: 20 },
  { name: 'Arroz (kg)', category: 'comida', unit: 'kg', kcalPerUnit: 3600 },
  { name: 'Feijão (kg)', category: 'comida', unit: 'kg', kcalPerUnit: 3300 },
  { name: 'Macarrão (kg)', category: 'comida', unit: 'kg', kcalPerUnit: 3700 },
  { name: 'Óleo (900 ml)', category: 'comida', unit: 'garrafa', kcalPerUnit: 7900 },
  { name: 'Lata de sardinha', category: 'comida', unit: 'lata', kcalPerUnit: 280 },
  { name: 'Leite em pó (400 g)', category: 'comida', unit: 'lata', kcalPerUnit: 2000 },
  { name: 'Aveia (500 g)', category: 'comida', unit: 'pacote', kcalPerUnit: 1900 },
  { name: 'Açúcar (kg)', category: 'comida', unit: 'kg', kcalPerUnit: 3870 },
]
const blank = { name: '', category: 'comida', quantity: 1, unit: 'un', kcalPerUnit: '', litersPerUnit: '', expiresAt: '', location: '', notes: '' }

export default function Supplies() {
  const qc = useQueryClient()
  const { data: items } = useQuery({ queryKey: ['supplies'], queryFn: () => api<any[]>('/api/supplies') })
  const { data: sum } = useQuery({ queryKey: ['supplies-summary'], queryFn: () => api('/api/supplies/summary') })
  const [edit, setEdit] = useState<any>(null)
  const [house, setHouse] = useState<any>(null)
  const [cat, setCat] = useState('')
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['supplies'] })
    qc.invalidateQueries({ queryKey: ['supplies-summary'] })
  }
  const save = async () => {
    const body = { ...edit, quantity: Number(edit.quantity), kcalPerUnit: edit.kcalPerUnit ? Number(edit.kcalPerUnit) : null, litersPerUnit: edit.litersPerUnit ? Number(edit.litersPerUnit) : null }
    edit.id ? await put(`/api/supplies/${edit.id}`, body) : await post('/api/supplies', body)
    setEdit(null)
    refresh()
  }
  const bump = async (it: any, d: number) => {
    await put(`/api/supplies/${it.id}`, { ...it, quantity: Math.max(0, it.quantity + d) })
    refresh()
  }
  const days = sum ? Math.min(sum.water.days, sum.food.days) : 0
  const list = (items ?? []).filter((i) => !cat || i.category === cat)
  const soon = (d: string | null) => d && new Date(d).getTime() - Date.now() < 30 * 86400_000

  return (
    <div>
      <PageHeader
        icon={<Backpack weight="duotone" className="size-6" />}
        eyebrow="Sobreviver"
        title="Suprimentos"
        subtitle="Inventário da casa e quantos dias ele sustenta a família."
        actions={
          <>
            <Button variant="dark" onClick={() => setHouse(sum?.household)}>
              <UsersThree /> {sum ? `${sum.household.adults} adultos · ${sum.household.children} crianças · ${sum.household.pets} pets` : 'Família'}
            </Button>
            <Button variant="primary" onClick={() => setEdit({ ...blank })}>
              <Plus weight="bold" /> Item
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6 md:px-8">
        <div className="grid gap-3 md:grid-cols-3">
          <Card gold className="p-5">
            <div className="text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Autonomia (limitada pelo menor)</div>
            <div className="mt-2 font-display text-[40px] leading-none font-extrabold">
              <span className={cn(days >= 30 ? 'text-gold-grad' : days >= 7 ? 'text-warn' : 'text-err')}>{fmtNum(days, 1)}</span>
              <span className="ml-2 text-lg text-fg-2">dias</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-base">
              <div className="bg-gold-grad h-full rounded-full" style={{ width: `${Math.min(100, (days / 30) * 100)}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-fg-3">meta: 30 dias</div>
          </Card>
          <Stat label="Água" icon={<Drop weight="duotone" className="size-5" />} tone="gold" value={`${fmtNum(sum?.water.days ?? 0, 1)} d`} hint={sum && `${fmtNum(sum.water.liters)} L em estoque · consumo ${fmtNum(sum.water.perDay, 1)} L/dia`} />
          <Stat label="Comida" icon={<ForkKnife weight="duotone" className="size-5" />} tone="gold" value={`${fmtNum(sum?.food.days ?? 0, 1)} d`} hint={sum && `${fmtNum(sum.food.kcal)} kcal · consumo ${fmtNum(sum.food.perDay)} kcal/dia`} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['', ...Object.keys(CATS)].map((c) => (
            <button key={c} onClick={() => setCat(c)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold', cat === c ? 'border-gold/40 bg-gold/10 text-gold' : 'border-line-2 text-fg-2 hover:text-fg')}>
              {c ? CATS[c] : 'Todos'} {c && sum?.counts?.[c] ? `· ${sum.counts[c]}` : ''}
            </button>
          ))}
        </div>

        {!items?.length ? (
          <Empty icon={<Backpack className="size-6" />} title="Inventário vazio">
            Cadastre água e comida para calcular quantos dias vocês aguentam. Use os atalhos com calorias já preenchidas.
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {PRESETS.slice(0, 6).map((p) => (
                <Button key={p.name} size="sm" variant="dark" onClick={() => setEdit({ ...blank, ...p, quantity: 1 })}>
                  {p.name}
                </Button>
              ))}
            </div>
          </Empty>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-fg-3 uppercase">
                  <th className="px-5 py-3 font-semibold">Item</th>
                  <th className="px-3 py-3 font-semibold">Categoria</th>
                  <th className="px-3 py-3 text-center font-semibold">Quantidade</th>
                  <th className="px-3 py-3 font-semibold">Rende</th>
                  <th className="px-3 py-3 font-semibold">Validade</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {list.map((it) => (
                  <tr key={it.id} className="group border-b border-line/60 hover:bg-elevated">
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{it.name}</div>
                      {it.location && <div className="text-xs text-fg-3">{it.location}</div>}
                    </td>
                    <td className="px-3">
                      <Badge>{CATS[it.category] ?? it.category}</Badge>
                    </td>
                    <td className="px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => bump(it, -1)} className="rounded-md border border-line-2 p-1 text-fg-3 hover:text-fg">
                          <Minus />
                        </button>
                        <span className="min-w-[64px] text-center tabular-nums">
                          {fmtNum(it.quantity, 1)} {it.unit}
                        </span>
                        <button onClick={() => bump(it, 1)} className="rounded-md border border-line-2 p-1 text-fg-3 hover:text-fg">
                          <Plus />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 text-xs text-fg-2">
                      {it.kcalPerUnit ? `${fmtNum(it.quantity * it.kcalPerUnit)} kcal` : it.litersPerUnit ? `${fmtNum(it.quantity * it.litersPerUnit)} L` : '—'}
                    </td>
                    <td className="px-3 text-xs">{it.expiresAt ? <span className={soon(it.expiresAt) ? 'font-semibold text-warn' : 'text-fg-2'}>{new Date(it.expiresAt).toLocaleDateString('pt-BR')}</span> : '—'}</td>
                    <td className="px-2">
                      <div className="hidden gap-1 group-hover:flex">
                        <button onClick={() => setEdit({ ...it, expiresAt: it.expiresAt?.slice(0, 10) ?? '' })} className="rounded p-1 text-fg-3 hover:text-fg">
                          <PencilSimple />
                        </button>
                        <button
                          onClick={async () => {
                            await del(`/api/supplies/${it.id}`)
                            refresh()
                          }}
                          className="rounded p-1 text-fg-3 hover:text-err"
                        >
                          <Trash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar item' : 'Novo item'}>
        {edit && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            {!edit.id && (
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button type="button" key={p.name} onClick={() => setEdit({ ...edit, ...p })} className="rounded-full border border-line-2 px-2.5 py-0.5 text-[11px] text-fg-2 hover:border-gold/40 hover:text-fg">
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <Field label="Nome">
              <Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Categoria">
                <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {Object.entries(CATS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantidade">
                <Input type="number" step="any" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} />
              </Field>
              <Field label="Unidade">
                <Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {edit.category === 'agua' ? (
                <Field label="Litros por unidade">
                  <Input type="number" step="any" value={edit.litersPerUnit ?? ''} onChange={(e) => setEdit({ ...edit, litersPerUnit: e.target.value })} />
                </Field>
              ) : (
                <Field label="kcal por unidade" hint="Veja na embalagem (kcal/100g × peso)">
                  <Input type="number" step="any" value={edit.kcalPerUnit ?? ''} onChange={(e) => setEdit({ ...edit, kcalPerUnit: e.target.value })} />
                </Field>
              )}
              <Field label="Validade">
                <Input type="date" value={edit.expiresAt ?? ''} onChange={(e) => setEdit({ ...edit, expiresAt: e.target.value })} />
              </Field>
            </div>
            <Field label="Onde está guardado">
              <Input value={edit.location ?? ''} onChange={(e) => setEdit({ ...edit, location: e.target.value })} placeholder="Despensa, garagem…" />
            </Field>
            <Field label="Notas">
              <Textarea rows={2} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEdit(null)}>
                Cancelar
              </Button>
              <Button variant="primary">Salvar</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!house} onClose={() => setHouse(null)} title="Quem está na casa">
        {house && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              await put('/api/settings', { household: { adults: Number(house.adults), children: Number(house.children), pets: Number(house.pets) } })
              setHouse(null)
              refresh()
            }}
          >
            <div className="grid grid-cols-3 gap-3">
              <Field label="Adultos" hint="3 L · 2000 kcal/dia">
                <Input type="number" min={0} value={house.adults} onChange={(e) => setHouse({ ...house, adults: e.target.value })} />
              </Field>
              <Field label="Crianças" hint="2 L · 1400 kcal/dia">
                <Input type="number" min={0} value={house.children} onChange={(e) => setHouse({ ...house, children: e.target.value })} />
              </Field>
              <Field label="Pets" hint="0,5 L/dia">
                <Input type="number" min={0} value={house.pets} onChange={(e) => setHouse({ ...house, pets: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button variant="primary">Salvar</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
