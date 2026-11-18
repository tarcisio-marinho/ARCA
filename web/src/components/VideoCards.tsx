import { MonitorPlay, Play } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { fmtTime, fmtVideoDate, videoLink, type VideoHit } from '../lib/video'
import { Highlighted } from './Highlighted'
import { Card } from './ui'

export function Thumb({ v, className }: { v: { thumb: string | null; title: string; duration: number | null }; className?: string }) {
  return (
    <div className={`relative aspect-video overflow-hidden rounded-xl border border-line bg-elevated ${className ?? ''}`}>
      {v.thumb ? (
        <img src={v.thumb} alt="" loading="lazy" decoding="async" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      ) : (
        <div className="flex size-full items-center justify-center text-fg-3">
          <MonitorPlay className="size-8" />
        </div>
      )}
      {v.duration != null && <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">{fmtTime(v.duration)}</span>}
      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
        <span className="flex size-11 items-center justify-center rounded-full bg-gold-grad text-gold-ink shadow-lg">
          <Play weight="fill" className="size-5" />
        </span>
      </span>
    </div>
  )
}

/** Resultado de busca nas falas: vídeo + trechos com o segundo (cada trecho abre o vídeo ali). */
export function VideoHitCard({ h, q, compact }: { h: VideoHit; q: string; compact?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <Link to={videoLink(h.id, h.snippets[0]?.t, q)} className="group flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-elevated">
        <Thumb v={h} className={compact ? 'w-24 shrink-0 rounded-lg' : 'w-32 shrink-0 rounded-lg'} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-semibold group-hover:text-gold">{h.title}</div>
          <div className="mt-0.5 text-xs text-fg-3">
            {fmtVideoDate(h.date)}
            {h.count > 0 ? ` · ${h.count} ocorrência(s) nas falas` : ' · termo no título'}
          </div>
        </div>
      </Link>
      {h.snippets.length > 0 && (
        <div className="divide-y divide-line/60">
          {h.snippets.map((s, i) => (
            <Link key={i} to={videoLink(h.id, s.t, q)} className="flex items-baseline gap-3 px-4 py-2.5 text-[13px] leading-relaxed text-fg-2 hover:bg-elevated">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gold/25 bg-gold/10 px-1.5 font-mono text-[11.5px] font-semibold text-gold">
                <Play weight="fill" className="size-2.5" />
                {fmtTime(s.t)}
              </span>
              <span>
                <Highlighted s={s} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
