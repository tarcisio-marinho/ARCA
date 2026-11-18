import { Crosshair, MapPin, MapTrifold, Trash, X } from '@phosphor-icons/react'
import { layers, namedFlavor } from '@protomaps/basemaps'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, cn, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { api, del, fmtBytes, post } from '../lib/api'

const KINDS: Record<string, { label: string; color: string }> = {
  agua: { label: 'Fonte de água', color: '#60a5fa' },
  abrigo: { label: 'Abrigo', color: '#22c55e' },
  hospital: { label: 'Saúde / hospital', color: '#ef4444' },
  encontro: { label: 'Ponto de encontro', color: '#f5a623' },
  suprimento: { label: 'Suprimentos', color: '#a78bfa' },
  perigo: { label: 'Perigo / evitar', color: '#f97316' },
  ponto: { label: 'Outro', color: '#aaaaaa' },
}

let protocolAdded = false
type Region = { file: string; label: string; minZoom: number; maxZoom: number; bounds: number[]; size: number }

function dms(v: number, pos: string, neg: string) {
  const a = Math.abs(v)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  const s = ((a - d - m / 60) * 3600).toFixed(1)
  return `${d}°${m}'${s}"${v >= 0 ? pos : neg}`
}

export default function Maps() {
  const qc = useQueryClient()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const [region, setRegion] = useState<string>(() => localStorage.getItem('arca.region') ?? '')
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null)
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null)
  const [form, setForm] = useState({ name: '', kind: 'agua', notes: '' })
  const [addMode, setAddMode] = useState(false)
  const [glError, setGlError] = useState<string | null>(null)
  const addModeRef = useRef(false)
  addModeRef.current = addMode

  const { data: regions } = useQuery({ queryKey: ['regions'], queryFn: () => api<Region[]>('/api/map/regions') })
  const { data: points } = useQuery({ queryKey: ['points'], queryFn: () => api<any[]>('/api/map/points') })

  useEffect(() => {
    if (!region && regions?.length) setRegion(regions.find((r) => r.file.startsWith('br_'))?.file ?? regions[0].file)
  }, [regions, region])

  // cria/recria o mapa ao trocar de região
  useEffect(() => {
    if (!region || !el.current || !regions) return
    localStorage.setItem('arca.region', region)
    if (!protocolAdded) {
      maplibregl.addProtocol('pmtiles', new Protocol().tile)
      protocolAdded = true
    }
    const r = regions.find((x) => x.file === region)
    const origin = window.location.origin
    let m: maplibregl.Map
    try {
      m = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        glyphs: `${origin}/maps/basemaps-assets/fonts/{fontstack}/{range}.pbf`,
        sprite: `${origin}/maps/basemaps-assets/sprites/v4/dark`,
        sources: {
          protomaps: {
            type: 'vector',
            url: `pmtiles://${origin}/maps/pmtiles/${region}`,
            attribution: '© OpenStreetMap · Protomaps',
          },
        },
        layers: layers('protomaps', namedFlavor('dark'), { lang: 'pt' }) as any,
      },
      center: r ? [(r.bounds[0] + r.bounds[2]) / 2, (r.bounds[1] + r.bounds[3]) / 2] : [-47.9, -15.8],
      zoom: r?.file.startsWith('world') ? 1.5 : 4,
      maxZoom: Math.min(19, (r?.maxZoom ?? 15) + 4),
      attributionControl: { compact: true },
      })
    } catch (e) {
      setGlError((e as Error).message?.slice(0, 200) || 'WebGL indisponível')
      return
    }
    setGlError(null)
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    m.on('mousemove', (e) => setCursor({ lat: e.lngLat.lat, lng: e.lngLat.lng }))
    m.on('click', (e) => {
      if (!addModeRef.current) return
      setDraft({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      setAddMode(false)
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [region, regions])

  // marcadores
  useEffect(() => {
    markers.current.forEach((mk) => mk.remove())
    markers.current = []
    if (!map.current || !points) return
    for (const p of points) {
      const k = KINDS[p.kind] ?? KINDS.ponto
      const dot = document.createElement('div')
      dot.style.cssText = `width:16px;height:16px;border-radius:50%;background:${k.color};border:2px solid #0a0a0a;box-shadow:0 0 0 2px ${k.color}55,0 2px 8px #000`
      const popup = new maplibregl.Popup({ offset: 12 }).setHTML(
        `<div style="font-weight:700">${p.name.replace(/</g, '&lt;')}</div><div style="font-size:12px;color:${k.color}">${k.label}</div>${p.notes ? `<div style="font-size:12px;color:#aaa;margin-top:4px">${p.notes.replace(/</g, '&lt;')}</div>` : ''}<div style="font-size:11px;color:#666;margin-top:4px">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>`
      )
      markers.current.push(new maplibregl.Marker({ element: dot }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map.current))
    }
  }, [points, region])

  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = addMode ? 'crosshair' : ''
  }, [addMode])

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => map.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 15 }),
      () => toast.error('Localização indisponível (sem GPS/Wi-Fi). Navegue até o local manualmente.'),
      { timeout: 8000 }
    )

  return (
    <div className="relative flex h-full">
      <div ref={el} className="min-w-0 flex-1 bg-[#0e0e0e]" />
      {glError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-base/95 p-6">
          <div className="max-w-md text-center">
            <MapTrifold weight="duotone" className="mx-auto size-12 text-gold" />
            <div className="mt-3 font-display text-xl font-bold">O navegador não liberou WebGL</div>
            <p className="mt-2 text-sm text-fg-2">O mapa precisa de aceleração gráfica. Ative “Usar aceleração de hardware” nas configurações do navegador e recarregue a página.</p>
          </div>
        </div>
      )}

      {/* painel */}
      <div className="absolute top-3 left-3 z-10 w-[300px] max-w-[calc(100%-24px)] space-y-2">
        <Card className="bg-surface/95 p-3 backdrop-blur">
          <div className="mb-2 flex items-center gap-2">
            <MapTrifold weight="duotone" className="size-5 text-gold" />
            <span className="font-display font-bold">Mapas offline</span>
          </div>
          <Select value={region} onChange={(e) => setRegion(e.target.value)} className="h-9 text-[13px]">
            {regions?.map((r) => (
              <option key={r.file} value={r.file}>
                {r.label} · até z{r.maxZoom} · {fmtBytes(r.size)}
              </option>
            ))}
          </Select>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant={addMode ? 'primary' : 'dark'} className="flex-1" onClick={() => setAddMode(!addMode)}>
              <MapPin /> {addMode ? 'Clique no mapa…' : 'Marcar ponto'}
            </Button>
            <Button size="sm" variant="dark" onClick={locate} title="Minha localização">
              <Crosshair />
            </Button>
          </div>
          {cursor && (
            <div className="mt-2 font-mono text-[11px] leading-relaxed text-fg-3">
              {cursor.lat.toFixed(5)}, {cursor.lng.toFixed(5)}
              <br />
              {dms(cursor.lat, 'N', 'S')} {dms(cursor.lng, 'L', 'O')}
            </div>
          )}
        </Card>

        {!!points?.length && (
          <Card className="max-h-[50vh] overflow-y-auto bg-surface/95 p-2 backdrop-blur">
            <div className="px-2 py-1 text-[10.5px] font-semibold tracking-[0.14em] text-fg-3 uppercase">Pontos marcados</div>
            {points.map((p) => (
              <div key={p.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-elevated">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: (KINDS[p.kind] ?? KINDS.ponto).color }} />
                <button className="min-w-0 flex-1 truncate text-left text-[13px]" onClick={() => map.current?.flyTo({ center: [p.lng, p.lat], zoom: 15 })}>
                  {p.name}
                </button>
                <button
                  className="hidden text-fg-3 group-hover:block hover:text-err"
                  onClick={async () => {
                    await del(`/api/map/points/${p.id}`)
                    qc.invalidateQueries({ queryKey: ['points'] })
                  }}
                >
                  <Trash />
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>

      {addMode && (
        <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gold/30 bg-surface/95 px-4 py-2 text-sm backdrop-blur">
          Clique no mapa para marcar
          <button onClick={() => setAddMode(false)} className="text-fg-3 hover:text-fg">
            <X />
          </button>
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title="Novo ponto">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            await post('/api/map/points', { ...form, ...draft })
            qc.invalidateQueries({ queryKey: ['points'] })
            setDraft(null)
            setForm({ name: '', kind: form.kind, notes: '' })
          }}
        >
          <div className="font-mono text-xs text-fg-3">
            {draft?.lat.toFixed(6)}, {draft?.lng.toFixed(6)}
          </div>
          <Field label="Nome">
            <Input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Nascente atrás da escola" />
          </Field>
          <Field label="Tipo">
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(KINDS).map(([k, v]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setForm({ ...form, kind: k })}
                  className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px]', form.kind === k ? 'border-gold/40 bg-gold/10' : 'border-line-2 hover:border-line-3')}
                >
                  <span className="size-2.5 rounded-full" style={{ background: v.color }} />
                  {v.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Observações">
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Horários, condição da água, contato…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button variant="primary">Salvar ponto</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
