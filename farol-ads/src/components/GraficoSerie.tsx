'use client'
import { useMemo, useRef, useState } from 'react'
import type { PontoSerie } from '@/lib/tipos'
import { reais } from '@/lib/fmt'

/**
 * Receita atribuída e investimento (barras) + margem após ads (linha), no MESMO eixo
 * em reais — nunca dois eixos. Cores da paleta validada; legenda sempre presente;
 * tooltip com os três valores ao passar o mouse/dedo.
 */
const COR = { receita: '#2a78d6', investimento: '#eb6834', margem: '#1baf7a' }

function agrupar(pontos: PontoSerie[]): PontoSerie[] {
  if (pontos.length <= 62) return pontos
  // Períodos longos: soma por semana para as barras não virarem fio.
  const out: PontoSerie[] = []
  for (let i = 0; i < pontos.length; i += 7) {
    const g = pontos.slice(i, i + 7)
    out.push(g.reduce((a, p) => ({ data: a.data, receita: a.receita + p.receita, investimento: a.investimento + p.investimento, margemPosAds: a.margemPosAds + p.margemPosAds }),
      { data: g[0].data, receita: 0, investimento: 0, margemPosAds: 0 }))
  }
  return out
}

function passoBonito(max: number) {
  const bruto = max / 4
  const mag = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)))
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= bruto) ?? bruto
}

export default function GraficoSerie({ pontos: brutos, altura = 260, mostrarBarras = true }: { pontos: PontoSerie[]; altura?: number; mostrarBarras?: boolean }) {
  const pontos = useMemo(() => agrupar(brutos), [brutos])
  const semanal = pontos.length !== brutos.length
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)

  if (pontos.length === 0) return <p className="py-16 text-center text-sm text-tinta-fraca">Sem dados no período.</p>

  const L = 64, R = 12, T = 12, B = 28
  const W = 720
  const H = altura
  const valores = pontos.flatMap(p => [mostrarBarras ? p.receita : 0, mostrarBarras ? p.investimento : 0, p.margemPosAds])
  const passo = passoBonito(Math.max(...valores.map(Math.abs), 1))
  const max = Math.ceil(Math.max(...valores, 0) / passo) * passo || passo
  const min = Math.floor(Math.min(...valores, 0) / passo) * passo
  const y = (v: number) => T + ((max - v) / (max - min)) * (H - T - B)
  const larg = (W - L - R) / pontos.length
  const x = (i: number) => L + larg * i + larg / 2
  const barra = Math.max(1.5, Math.min(14, (larg - 4) / 2))
  const ticks: number[] = []
  for (let v = min; v <= max + 1e-9; v += passo) ticks.push(v)
  const rotuloData = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const cadaN = Math.ceil(pontos.length / 6)
  const linha = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.margemPosAds).toFixed(1)}`).join(' ')

  const mover = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const px = ((clientX - r.left) / r.width) * W
    const i = Math.floor((px - L) / larg)
    setHover(i >= 0 && i < pontos.length ? i : null)
  }
  const h = hover != null ? pontos[hover] : null

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-fraca" aria-hidden>
        {mostrarBarras && <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: COR.receita }} />Receita atribuída a ads</span>}
        {mostrarBarras && <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: COR.investimento }} />Investimento</span>}
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-3.5 rounded" style={{ background: COR.margem }} />Margem após ads</span>
        {semanal && <span className="italic">valores somados por semana</span>}
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none select-none" role="img"
        aria-label={`Gráfico de ${pontos.length} ${semanal ? 'semanas' : 'dias'}: receita atribuída, investimento e margem após ads`}
        onMouseMove={e => mover(e.clientX)} onMouseLeave={() => setHover(null)}
        onTouchStart={e => mover(e.touches[0].clientX)} onTouchMove={e => mover(e.touches[0].clientX)}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#9AA69D' : '#E9EEE8'} strokeWidth={v === 0 ? 1 : 1} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#5C6B60">{reais(v)}</text>
          </g>
        ))}
        {pontos.map((p, i) => i % cadaN === 0 && (
          <text key={p.data} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#5C6B60">{rotuloData(p.data)}</text>
        ))}
        {hover != null && <rect x={L + larg * hover} y={T} width={larg} height={H - T - B} fill="#16241C" opacity={0.05} />}
        {mostrarBarras && pontos.map((p, i) => (
          <g key={p.data}>
            <rect x={x(i) - barra - 1} y={y(Math.max(p.receita, 0))} width={barra} height={Math.max(0, y(0) - y(Math.max(p.receita, 0)))} rx={Math.min(3, barra / 2)} fill={COR.receita} />
            <rect x={x(i) + 1} y={y(Math.max(p.investimento, 0))} width={barra} height={Math.max(0, y(0) - y(Math.max(p.investimento, 0)))} rx={Math.min(3, barra / 2)} fill={COR.investimento} />
          </g>
        ))}
        <path d={linha} fill="none" stroke={COR.margem} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        {h && <circle cx={x(hover!)} cy={y(h.margemPosAds)} r={4.5} fill={COR.margem} stroke="#fff" strokeWidth={2} />}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-6 z-10 rounded-lg border border-linha bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${Math.min(Math.max((x(hover!) / W) * 100, 12), 70)}%` }}>
          <p className="mb-1 font-semibold">{semanal ? 'Semana de ' : ''}{h.data.split('-').reverse().join('/')}</p>
          {mostrarBarras && <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: COR.receita }} />Receita atribuída</span><b className="tabular-nums">{reais(h.receita)}</b></p>}
          {mostrarBarras && <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: COR.investimento }} />Investimento</span><b className="tabular-nums">{reais(h.investimento)}</b></p>}
          <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: COR.margem }} />Margem após ads</span><b className={`tabular-nums ${h.margemPosAds < 0 ? 'text-red-700' : ''}`}>{reais(h.margemPosAds)}</b></p>
        </div>
      )}
    </div>
  )
}
