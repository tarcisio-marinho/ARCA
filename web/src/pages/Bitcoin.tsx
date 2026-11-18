import {
  ArrowsClockwise,
  CheckCircle,
  CurrencyBtc,
  Eye,
  Key,
  MagnifyingGlass,
  PaperPlaneTilt,
  Plus,
  QrCode,
  Signature,
  Trash,
  Tray,
  Wallet,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import QR from 'qrcode'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, cn, CopyButton, Empty, Field, Input, Modal, PageHeader, Select, Tabs, Textarea } from '../components/ui'
import { api, del, fmtDate, fmtSats, post, timeAgo } from '../lib/api'

type W = { id: number; name: string; network: string; kind: string; scriptType: string; accountPath: string; xpub: string; watchOnly: boolean; balance: { confirmed: number; unconfirmed: number } | null; fetchedAt: string | null; utxoCount: number }
const ST_LABEL: Record<string, string> = { p2wpkh: 'SegWit nativo (bc1q…)', p2tr: 'Taproot (bc1p…)', 'p2sh-p2wpkh': 'SegWit aninhado (3…)', p2pkh: 'Legado (1…)' }
const toSats = (btc: string) => Math.round(Number(btc.replace(',', '.')) * 1e8)

function QrBox({ text, size = 220 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    QR.toString(text, { type: 'svg', margin: 1 }).then(setSvg).catch(() => setSvg(''))
  }, [text])
  return svg ? <div style={{ width: size }} className="overflow-hidden rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} /> : null
}

function Mono({ children, label }: { children: string; label?: string }) {
  return (
    <div className="rounded-xl border border-line bg-base">
      {label && (
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
          <span className="text-[11px] font-semibold text-fg-3 uppercase">{label}</span>
          <CopyButton text={children} />
        </div>
      )}
      <pre className="max-h-48 overflow-auto p-3 font-mono text-[12px] break-all whitespace-pre-wrap text-fg-2">{children}</pre>
    </div>
  )
}

function Decoded({ d }: { d: any }) {
  if (!d) return null
  return (
    <Card className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge tone="gold">{d.kind === 'psbt' ? 'PSBT' : 'Transação bruta'}</Badge>
        <Badge tone={d.isFinal ? 'ok' : 'warn'}>{d.isFinal ? 'assinada/final' : 'não finalizada'}</Badge>
        {d.rbf && <Badge tone="info">RBF</Badge>}
        {d.vsize && <Badge>{d.vsize} vB</Badge>}
        {d.fee != null && <Badge tone="neutral">taxa {d.fee} sats{d.feeRate ? ` · ${d.feeRate} sat/vB` : ''}</Badge>}
      </div>
      {d.txid && <div className="font-mono text-xs break-all text-fg-3">txid: {d.txid}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-fg-3 uppercase">Entradas ({d.inputs.length})</div>
          {d.inputs.map((i: any, k: number) => (
            <div key={k} className="mb-1 rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs">
              <div className="truncate font-mono text-fg-3">{i.prevout}</div>
              <div className="flex justify-between gap-2">
                <span className="truncate font-mono">{i.address ?? '—'}</span>
                <span className="shrink-0">{i.amount != null ? fmtSats(i.amount) : '?'}</span>
              </div>
              <div className={cn('text-[11px]', i.signed ? 'text-ok' : 'text-warn')}>{i.signed ? '✔ assinada' : 'sem assinatura'}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold text-fg-3 uppercase">Saídas ({d.outputs.length})</div>
          {d.outputs.map((o: any, k: number) => (
            <div key={k} className="mb-1 flex justify-between gap-2 rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs">
              <span className="truncate font-mono">{o.address}</span>
              <span className="shrink-0 font-semibold">{fmtSats(o.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ───────────────── criar / importar ─────────────────
function CreateWallet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<'new' | 'mnemonic' | 'xpub' | 'wif'>('new')
  const [f, setF] = useState({ name: 'Carteira principal', network: 'mainnet', scriptType: 'p2wpkh', secret: '', bip39Passphrase: '', password: '', password2: '', words: '12', entropy: '' })
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const set = (k: string, v: string) => setF({ ...f, [k]: v })

  const gen = async () => {
    const r = await post('/api/btc/mnemonic', { words: Number(f.words), extraEntropy: f.entropy || undefined })
    set('secret', r.mnemonic)
    setConfirmed(false)
  }
  const save = async () => {
    if (kind !== 'xpub' && f.password !== f.password2) return toast.error('As senhas não conferem')
    setBusy(true)
    try {
      await post('/api/btc/wallets', {
        name: f.name,
        network: f.network,
        scriptType: f.scriptType,
        kind: kind === 'new' ? 'mnemonic' : kind,
        secret: f.secret,
        bip39Passphrase: f.bip39Passphrase || undefined,
        password: kind === 'xpub' ? undefined : f.password,
      })
      toast.success('Carteira salva')
      qc.invalidateQueries({ queryKey: ['wallets'] })
      onClose()
      setF({ ...f, secret: '', password: '', password2: '', bip39Passphrase: '' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar carteira" wide>
      <div className="space-y-4">
        <Tabs
          value={kind}
          onChange={(v) => {
            setKind(v)
            set('secret', '')
          }}
          items={[
            { value: 'new', label: 'Gerar nova semente' },
            { value: 'mnemonic', label: 'Importar semente' },
            { value: 'xpub', label: 'Watch-only (xpub/zpub)' },
            { value: 'wif', label: 'Chave única (WIF)' },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nome">
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Rede">
            <Select value={f.network} onChange={(e) => set('network', e.target.value)}>
              <option value="mainnet">Mainnet (real)</option>
              <option value="testnet">Testnet</option>
              <option value="signet">Signet</option>
            </Select>
          </Field>
          <Field label="Tipo de endereço">
            <Select value={f.scriptType} onChange={(e) => set('scriptType', e.target.value)}>
              {Object.entries(ST_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {kind === 'new' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Palavras">
                <Select value={f.words} onChange={(e) => set('words', e.target.value)} className="w-28">
                  <option>12</option>
                  <option>24</option>
                </Select>
              </Field>
              <Field label="Entropia extra (opcional)" hint="Jogue um dado ~100x e digite os números. É misturada ao gerador do sistema." className="min-w-[220px] flex-1">
                <Input value={f.entropy} onChange={(e) => set('entropy', e.target.value)} placeholder="ex: 3615264..." />
              </Field>
              <Button variant="secondary" onClick={gen}>
                <ArrowsClockwise /> Gerar
              </Button>
            </div>
            {f.secret && (
              <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-warn">
                  <WarningCircle weight="fill" /> Anote estas palavras em PAPEL, na ordem. Sem elas, o dinheiro é perdido.
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {f.secret.split(' ').map((w, i) => (
                    <div key={i} className="rounded-lg border border-line-2 bg-base px-2 py-1.5 font-mono text-[13px]">
                      <span className="mr-1.5 text-fg-3">{i + 1}.</span>
                      {w}
                    </div>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="accent-[#f5a623]" />
                  Já anotei a semente em papel e conferi.
                </label>
              </div>
            )}
          </div>
        )}
        {kind === 'mnemonic' && (
          <Field label="Semente (12 ou 24 palavras, inglês BIP39)">
            <Textarea rows={3} value={f.secret} onChange={(e) => set('secret', e.target.value)} className="font-mono" spellCheck={false} autoComplete="off" />
          </Field>
        )}
        {kind === 'xpub' && (
          <Field label="Chave pública estendida" hint="xpub/ypub/zpub/tpub/vpub do nível da conta (ex.: exportada da sua hardware wallet). Só consulta saldo e monta PSBT — não assina.">
            <Textarea rows={3} value={f.secret} onChange={(e) => set('secret', e.target.value)} className="font-mono text-[12px]" spellCheck={false} />
          </Field>
        )}
        {kind === 'wif' && (
          <Field label="Chave privada WIF">
            <Input type="password" value={f.secret} onChange={(e) => set('secret', e.target.value)} className="font-mono" autoComplete="off" />
          </Field>
        )}
        {(kind === 'new' || kind === 'mnemonic') && (
          <Field label="Passphrase BIP39 (opcional — a “25ª palavra”)" hint="Se usar, ela é tão importante quanto a semente.">
            <Input value={f.bip39Passphrase} onChange={(e) => set('bip39Passphrase', e.target.value)} autoComplete="off" />
          </Field>
        )}
        {kind !== 'xpub' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Senha local (cifra a chave no banco)" hint="AES-256-GCM + scrypt. Pedida a cada assinatura.">
              <Input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirmar senha">
              <Input type="password" value={f.password2} onChange={(e) => set('password2', e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!f.secret || (kind === 'new' && !confirmed) || (kind !== 'xpub' && !f.password)} onClick={save}>
            Salvar carteira
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ───────────────── detalhe da carteira ─────────────────
function WalletPanel({ w, online }: { w: W; online: boolean }) {
  const qc = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [reveal, setReveal] = useState(false)
  const [pw, setPw] = useState('')
  const [secret, setSecret] = useState<any>(null)
  const { data: addrs } = useQuery({ queryKey: ['addrs', w.id], queryFn: () => api<any[]>(`/api/btc/wallets/${w.id}/addresses?count=10`) })
  const { data: det } = useQuery({ queryKey: ['wdet', w.id, w.fetchedAt], queryFn: () => api(`/api/btc/wallets/${w.id}`) })
  const sync = async () => {
    setSyncing(true)
    try {
      await post(`/api/btc/wallets/${w.id}/sync`)
      qc.invalidateQueries({ queryKey: ['wallets'] })
      toast.success('Saldo atualizado e salvo para uso offline')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }
  const total = (w.balance?.confirmed ?? 0) + (w.balance?.unconfirmed ?? 0)
  const nextIdx = det?.wallet?.nextReceive ?? 0
  return (
    <div className="space-y-4">
      <Card gold className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-bold">{w.name}</span>
              <Badge tone={w.network === 'mainnet' ? 'gold' : 'info'}>{w.network}</Badge>
              {w.watchOnly && <Badge tone="neutral">watch-only</Badge>}
            </div>
            <div className="mt-0.5 text-xs text-fg-3">
              {ST_LABEL[w.scriptType]} · {w.accountPath}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="dark" loading={syncing} disabled={!online} onClick={sync} title={online ? '' : 'Sem internet — usando último saldo salvo'}>
              <ArrowsClockwise /> Sincronizar
            </Button>
            {!w.watchOnly && (
              <Button size="sm" variant="ghost" onClick={() => setReveal(true)}>
                <Eye /> Ver segredo
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!confirm(`Apagar a carteira "${w.name}" desta máquina? (a semente/fundos não são afetados se você tiver backup)`)) return
                await del(`/api/btc/wallets/${w.id}`)
                qc.invalidateQueries({ queryKey: ['wallets'] })
              }}
            >
              <Trash />
            </Button>
          </div>
        </div>
        <div className="mt-4 font-display text-[34px] leading-none font-bold tracking-tight">
          {w.balance ? <span className="text-gold-grad">{fmtSats(total)}</span> : <span className="text-fg-3">—</span>}
        </div>
        <div className="mt-2 text-xs text-fg-2">
          {w.fetchedAt ? (
            <>
              {w.balance!.unconfirmed ? `${fmtSats(w.balance!.unconfirmed)} não confirmado · ` : ''}
              {w.utxoCount} UTXOs · atualizado {timeAgo(w.fetchedAt)} {!online && <b className="text-warn">(saldo salvo — offline)</b>}
            </>
          ) : (
            'Nunca sincronizada. Sincronize enquanto houver internet para poder montar transações offline depois.'
          )}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Endereços de recebimento</div>
        <div className="space-y-1">
          {addrs?.map((a) => (
            <div key={a.index} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-elevated', a.index === nextIdx && 'bg-gold/5 ring-1 ring-gold/20')}>
              <span className="w-6 text-fg-3">#{a.index}</span>
              <span className="min-w-0 flex-1 truncate font-mono">{a.address}</span>
              {a.index === nextIdx && <Badge tone="gold">próximo</Badge>}
              <button onClick={() => setQr(a.address)} className="text-fg-3 hover:text-gold">
                <QrCode className="size-4" />
              </button>
              <CopyButton text={a.address} label="" />
            </div>
          ))}
        </div>
      </Card>

      {!!det?.utxos?.length && (
        <Card className="p-4">
          <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">UTXOs salvos</div>
          {det.utxos.map((u: any) => (
            <div key={u.txid + u.vout} className="flex justify-between gap-2 border-b border-line/50 py-1.5 text-xs last:border-0">
              <span className="truncate font-mono text-fg-3">
                {u.txid.slice(0, 16)}…:{u.vout}
              </span>
              <span className={u.confirmed ? '' : 'text-warn'}>{fmtSats(u.value)}</span>
            </div>
          ))}
        </Card>
      )}

      <Modal open={!!qr} onClose={() => setQr(null)} title="Receber">
        {qr && (
          <div className="flex flex-col items-center gap-3">
            <QrBox text={`bitcoin:${qr}`} size={260} />
            <div className="font-mono text-xs break-all">{qr}</div>
            <CopyButton text={qr} />
          </div>
        )}
      </Modal>
      <Modal
        open={reveal}
        onClose={() => {
          setReveal(false)
          setSecret(null)
          setPw('')
        }}
        title="Segredo da carteira"
      >
        {secret ? (
          <div className="space-y-3">
            <div className="text-sm text-warn">Ninguém deve ver isto. Feche ao terminar.</div>
            <Mono label="segredo">{secret.mnemonic ?? secret.xprv ?? secret.wif}</Mono>
            {secret.passphrase && <Mono label="passphrase">{secret.passphrase}</Mono>}
            {w.xpub && <Mono label="xpub (conta)">{w.xpub}</Mono>}
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                setSecret(await post(`/api/btc/wallets/${w.id}/reveal`, { password: pw }))
              } catch (err) {
                toast.error((err as Error).message)
              }
            }}
          >
            <Field label="Senha local">
              <Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Button variant="primary">Revelar</Button>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ───────────────── enviar ─────────────────
function Send({ wallets, online }: { wallets: W[]; online: boolean }) {
  const [wid, setWid] = useState<number>(wallets[0]?.id)
  const w = wallets.find((x) => x.id === wid)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [max, setMax] = useState(false)
  const [fee, setFee] = useState('5')
  const [unconf, setUnconf] = useState(false)
  const [built, setBuilt] = useState<any>(null)
  const [decoded, setDecoded] = useState<any>(null)
  const [pw, setPw] = useState('')
  const [signed, setSigned] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const { data: fees } = useQuery({ queryKey: ['fees', w?.network], queryFn: () => api(`/api/btc/fees?network=${w?.network}`), enabled: online && !!w })

  const reset = () => {
    setBuilt(null)
    setDecoded(null)
    setSigned(null)
    setResult(null)
  }
  const build = async () => {
    setBusy('build')
    try {
      const b = await post(`/api/btc/wallets/${wid}/psbt`, { outputs: [{ address: to.trim(), amount: max ? 0 : toSats(amount) }], feeRate: Number(fee), sendMax: max, includeUnconfirmed: unconf })
      setBuilt(b)
      setDecoded(await post('/api/btc/decode', { data: b.psbt, network: w?.network }))
      setSigned(null)
      setResult(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy('')
    }
  }
  const sign = async () => {
    setBusy('sign')
    try {
      const s = await post(`/api/btc/wallets/${wid}/sign`, { psbt: built.psbt, password: pw })
      setSigned(s)
      setDecoded(await post('/api/btc/decode', { data: s.hex ?? s.psbt, network: w?.network }))
      setPw('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy('')
    }
  }
  const broadcast = async () => {
    setBusy('bc')
    try {
      setResult(await post('/api/btc/broadcast', { hex: signed.hex, network: w?.network, walletId: wid }))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  if (!wallets.length) return <Empty icon={<Wallet className="size-6" />} title="Adicione uma carteira primeiro" />
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="space-y-4 p-5">
        <div className="text-[11px] font-semibold tracking-[0.12em] text-gold uppercase">1 · Montar (offline)</div>
        <Field label="Carteira">
          <Select
            value={wid}
            onChange={(e) => {
              setWid(Number(e.target.value))
              reset()
            }}
          >
            {wallets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {x.balance ? fmtSats(x.balance.confirmed + x.balance.unconfirmed) : 'sem saldo salvo'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Destino">
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="bc1q…" className="font-mono text-[13px]" spellCheck={false} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (BTC)">
            <Input value={max ? 'tudo' : amount} disabled={max} onChange={(e) => setAmount(e.target.value)} placeholder="0,001" />
          </Field>
          <Field label="Taxa (sat/vB)" hint={fees ? `rápida ${fees.rapida} · normal ${fees.normal} · econ. ${fees.economica}` : online ? '' : 'offline: escolha manual'}>
            <Input type="number" min={1} value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={max} onChange={(e) => setMax(e.target.checked)} className="accent-[#f5a623]" /> Enviar saldo total
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={unconf} onChange={(e) => setUnconf(e.target.checked)} className="accent-[#f5a623]" /> Usar não confirmados
          </label>
        </div>
        <Button variant="primary" className="w-full" loading={busy === 'build'} disabled={!to || (!max && !amount)} onClick={build}>
          Montar transação (PSBT)
        </Button>
        {built && (
          <>
            <div className="text-xs text-fg-2">
              Taxa: <b>{built.fee} sats</b> · {built.inputs} entrada(s){built.change ? ` · troco ${fmtSats(built.change)}` : ''}
            </div>
            <Mono label="PSBT (exporte para assinar em outro dispositivo, se for watch-only)">{built.psbt}</Mono>
            {w && !w.watchOnly && !signed && (
              <div className="space-y-2 border-t border-line pt-4">
                <div className="text-[11px] font-semibold tracking-[0.12em] text-gold uppercase">2 · Assinar (offline)</div>
                <div className="flex gap-2">
                  <Input type="password" placeholder="Senha local da carteira" value={pw} onChange={(e) => setPw(e.target.value)} />
                  <Button variant="primary" loading={busy === 'sign'} disabled={!pw} onClick={sign}>
                    <Key /> Assinar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {signed?.hex && (
          <div className="space-y-3 border-t border-line pt-4">
            <div className="text-[11px] font-semibold tracking-[0.12em] text-gold uppercase">3 · Transmitir</div>
            <Mono label={`transação assinada · txid ${signed.txid.slice(0, 12)}…`}>{signed.hex}</Mono>
            {signed.hex.length < 2800 && (
              <div className="flex justify-center">
                <QrBox text={signed.hex} size={240} />
              </div>
            )}
            <Button variant="primary" className="w-full" loading={busy === 'bc'} onClick={broadcast}>
              <PaperPlaneTilt /> {online ? 'Transmitir agora' : 'Guardar na fila (envia quando a internet voltar)'}
            </Button>
            {result && (
              <div className={cn('rounded-xl border px-3 py-2 text-sm', result.status === 'broadcast' ? 'border-ok/30 text-ok' : result.status === 'pending' ? 'border-warn/30 text-warn' : 'border-err/30 text-err')}>
                {result.status === 'broadcast' ? '✔ Transmitida! ' : result.status === 'pending' ? '⏳ Sem internet — na fila de transmissão. ' : '✘ Rejeitada: '}
                {result.error ?? result.txid}
              </div>
            )}
          </div>
        )}
      </Card>
      <div>{decoded && <Decoded d={decoded} />}</div>
    </div>
  )
}

// ───────────────── assinar PSBT externa / mensagens / decode / fila ─────────────────
function SignPsbt({ wallets }: { wallets: W[] }) {
  const signers = wallets.filter((w) => !w.watchOnly)
  const [wid, setWid] = useState(signers[0]?.id)
  const [psbt, setPsbt] = useState('')
  const [pw, setPw] = useState('')
  const [r, setR] = useState<any>(null)
  if (!signers.length) return <Empty icon={<Key className="size-6" />} title="Nenhuma carteira com chave privada" />
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3 p-5">
        <p className="text-sm text-fg-2">Cole uma PSBT criada em outro lugar (ex.: carteira watch-only no celular). A assinatura acontece aqui, sem rede.</p>
        <Field label="Carteira">
          <Select value={wid} onChange={(e) => setWid(Number(e.target.value))}>
            {signers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="PSBT (base64)">
          <Textarea rows={6} value={psbt} onChange={(e) => setPsbt(e.target.value)} className="font-mono text-[12px]" />
        </Field>
        <div className="flex gap-2">
          <Input type="password" placeholder="Senha local" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button
            variant="primary"
            onClick={async () => {
              try {
                setR(await post(`/api/btc/wallets/${wid}/sign`, { psbt, password: pw }))
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
          >
            <Signature /> Assinar
          </Button>
        </div>
      </Card>
      {r && (
        <div className="space-y-3">
          <Badge tone={r.complete ? 'ok' : 'warn'}>
            {r.signedInputs}/{r.totalInputs} entradas assinadas {r.complete ? '· pronta' : '· faltam assinaturas'}
          </Badge>
          <Mono label="PSBT assinada">{r.psbt}</Mono>
          {r.hex && <Mono label={`tx final · ${r.txid}`}>{r.hex}</Mono>}
        </div>
      )}
    </div>
  )
}

function Messages({ wallets }: { wallets: W[] }) {
  const signers = wallets.filter((w) => !w.watchOnly && w.scriptType !== 'p2tr')
  const [s, setS] = useState({ wid: signers[0]?.id, index: '0', message: '', password: '' })
  const [signed, setSigned] = useState<any>(null)
  const [v, setV] = useState({ address: '', message: '', signature: '' })
  const [vr, setVr] = useState<any>(null)
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3 p-5">
        <div className="font-semibold">Assinar mensagem</div>
        <p className="text-xs text-fg-3">Prova que você controla um endereço (BIP137, compatível com Electrum/Sparrow/Core).</p>
        {signers.length ? (
          <>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Select value={s.wid} onChange={(e) => setS({ ...s, wid: Number(e.target.value) })}>
                {signers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              <Input value={s.index} onChange={(e) => setS({ ...s, index: e.target.value })} placeholder="índice" title="Índice do endereço" />
            </div>
            <Textarea rows={3} placeholder="Mensagem" value={s.message} onChange={(e) => setS({ ...s, message: e.target.value })} />
            <div className="flex gap-2">
              <Input type="password" placeholder="Senha local" value={s.password} onChange={(e) => setS({ ...s, password: e.target.value })} />
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    setSigned(await post(`/api/btc/wallets/${s.wid}/sign-message`, { message: s.message, password: s.password, index: Number(s.index) }))
                  } catch (e) {
                    toast.error((e as Error).message)
                  }
                }}
              >
                Assinar
              </Button>
            </div>
            {signed && (
              <>
                <Mono label="endereço">{signed.address}</Mono>
                <Mono label="assinatura">{signed.signature}</Mono>
              </>
            )}
          </>
        ) : (
          <div className="text-sm text-fg-2">Precisa de uma carteira (não-taproot) com chave privada.</div>
        )}
      </Card>
      <Card className="space-y-3 p-5">
        <div className="font-semibold">Verificar assinatura</div>
        <Input placeholder="Endereço" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} className="font-mono text-[13px]" />
        <Textarea rows={3} placeholder="Mensagem (exata)" value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} />
        <Input placeholder="Assinatura (base64)" value={v.signature} onChange={(e) => setV({ ...v, signature: e.target.value })} className="font-mono text-[12px]" />
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              setVr(await post('/api/btc/verify-message', v))
            } catch (e) {
              setVr({ valid: false, error: (e as Error).message })
            }
          }}
        >
          Verificar
        </Button>
        {vr && (
          <div className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold', vr.valid ? 'border-ok/30 bg-ok/10 text-ok' : 'border-err/30 bg-err/10 text-err')}>
            {vr.valid ? <CheckCircle weight="fill" className="size-5" /> : <XCircle weight="fill" className="size-5" />}
            {vr.valid ? 'Assinatura VÁLIDA para este endereço' : vr.error ?? 'Assinatura INVÁLIDA'}
          </div>
        )}
      </Card>
    </div>
  )
}

function DecodeAndOutbox({ online }: { online: boolean }) {
  const qc = useQueryClient()
  const [data, setData] = useState('')
  const [net, setNet] = useState('mainnet')
  const [d, setD] = useState<any>(null)
  const { data: outbox } = useQuery({ queryKey: ['outbox'], queryFn: () => api<any[]>('/api/btc/outbox'), refetchInterval: 30_000 })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <Card className="space-y-3 p-5">
          <div className="font-semibold">Decodificar / transmitir</div>
          <Textarea rows={6} value={data} onChange={(e) => setData(e.target.value)} placeholder="Transação em hex ou PSBT em base64" className="font-mono text-[12px]" />
          <div className="flex flex-wrap gap-2">
            <Select value={net} onChange={(e) => setNet(e.target.value)} className="w-36">
              <option value="mainnet">mainnet</option>
              <option value="testnet">testnet</option>
              <option value="signet">signet</option>
            </Select>
            <Button
              variant="dark"
              onClick={async () => {
                try {
                  setD(await post('/api/btc/decode', { data, network: net }))
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            >
              <MagnifyingGlass /> Decodificar
            </Button>
            <Button
              variant="primary"
              disabled={!/^[0-9a-f\s]+$/i.test(data.trim()) || !data.trim()}
              onClick={async () => {
                const r = await post('/api/btc/broadcast', { hex: data, network: net }).catch((e) => ({ status: 'failed', error: e.message }))
                r.status === 'broadcast' ? toast.success(`Transmitida: ${r.txid}`) : r.status === 'pending' ? toast.warning('Sem internet: transação na fila') : toast.error(r.error)
                qc.invalidateQueries({ queryKey: ['outbox'] })
              }}
            >
              <PaperPlaneTilt /> Transmitir
            </Button>
          </div>
        </Card>
        <Decoded d={d} />
      </div>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Tray /> Fila de transmissão
          </div>
          <Button
            size="sm"
            variant="dark"
            disabled={!online}
            onClick={async () => {
              await post('/api/btc/outbox/retry')
              qc.invalidateQueries({ queryKey: ['outbox'] })
            }}
          >
            Reenviar pendentes
          </Button>
        </div>
        <p className="mb-3 text-xs text-fg-3">Transações assinadas sem internet ficam aqui e são reenviadas automaticamente a cada 5 min quando a conexão voltar.</p>
        {!outbox?.length && <div className="text-sm text-fg-2">Vazia.</div>}
        {outbox?.map((o) => (
          <div key={o.id} className="border-b border-line/60 py-2 text-xs last:border-0">
            <div className="flex items-center gap-2">
              <Badge tone={o.status === 'broadcast' ? 'ok' : o.status === 'pending' ? 'warn' : 'err'}>{o.status === 'broadcast' ? 'enviada' : o.status === 'pending' ? 'pendente' : 'falhou'}</Badge>
              <span className="text-fg-3">{o.network}</span>
              <span className="ml-auto text-fg-3">{fmtDate(o.createdAt)}</span>
            </div>
            <div className="mt-1 truncate font-mono">{o.txid}</div>
            {o.error && o.status !== 'broadcast' && <div className="mt-0.5 truncate text-err">{o.error}</div>}
          </div>
        ))}
      </Card>
    </div>
  )
}

export default function Bitcoin() {
  const [tab, setTab] = useState<'wallets' | 'send' | 'psbt' | 'msg' | 'tx'>('wallets')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: () => api<W[]>('/api/btc/wallets') })
  const { data: on } = useQuery({ queryKey: ['btc-online'], queryFn: () => api('/api/btc/online'), refetchInterval: 60_000 })
  const online = !!on?.online
  const current = wallets.find((w) => w.id === selected) ?? wallets[0]

  return (
    <div>
      <PageHeader
        icon={<CurrencyBtc weight="duotone" className="size-6" />}
        eyebrow="Tecnologia"
        title="Bitcoin"
        subtitle={
          <span className="flex items-center gap-2">
            Carteiras, assinatura offline (PSBT) e transmissão quando houver rede.
            <Badge tone={online ? 'ok' : 'warn'} dot>
              {online ? 'rede Bitcoin acessível' : 'offline — modo cofre'}
            </Badge>
          </span>
        }
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus weight="bold" /> Carteira
          </Button>
        }
      />
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6 md:px-8">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'wallets', label: 'Carteiras', icon: <Wallet /> },
            { value: 'send', label: 'Enviar', icon: <PaperPlaneTilt /> },
            { value: 'psbt', label: 'Assinar PSBT', icon: <Key /> },
            { value: 'msg', label: 'Mensagens', icon: <Signature /> },
            { value: 'tx', label: 'Decodificar & fila', icon: <MagnifyingGlass /> },
          ]}
        />
        {tab === 'wallets' &&
          (wallets.length ? (
            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="space-y-2">
                {wallets.map((w) => (
                  <button key={w.id} onClick={() => setSelected(w.id)} className="block w-full text-left">
                    <Card className={cn('p-3.5 transition', current?.id === w.id ? 'border-gold/35 bg-elevated' : 'hover:border-line-3')}>
                      <div className="flex items-center gap-2">
                        <Wallet weight="duotone" className="size-5 text-gold" />
                        <span className="truncate font-semibold">{w.name}</span>
                      </div>
                      <div className="mt-1 text-xs text-fg-2">{w.balance ? fmtSats(w.balance.confirmed + w.balance.unconfirmed) : 'não sincronizada'}</div>
                    </Card>
                  </button>
                ))}
              </div>
              {current && <WalletPanel key={current.id} w={current} online={online} />}
            </div>
          ) : (
            <Empty icon={<Wallet className="size-6" />} title="Nenhuma carteira">
              Gere uma semente nova, importe a sua, ou adicione uma xpub (watch-only) para acompanhar saldo e montar transações para assinar na hardware wallet.
            </Empty>
          ))}
        {tab === 'send' && <Send wallets={wallets} online={online} />}
        {tab === 'psbt' && <SignPsbt wallets={wallets} />}
        {tab === 'msg' && <Messages wallets={wallets} />}
        {tab === 'tx' && <DecodeAndOutbox online={online} />}
      </div>
      <CreateWallet open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
