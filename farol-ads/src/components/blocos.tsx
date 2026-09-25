import Link from 'next/link'
import { ArrowRight, CircleAlert, Clock, Lock, Search, Target, TrendingDown } from 'lucide-react'
import type { AnuncioPainel } from '@/lib/dados'
import type { Diagnostico } from '@/lib/tipos'
import { dataLonga, reais } from '@/lib/fmt'
import { ESTILO_ESTADO, SeloEstado, SeloGravidade } from './selos'

/** Explicabilidade obrigatória (6.5): Situação → Evidência → Impacto → Ação. */
export function BlocoDiagnostico({ d, compacto = false }: { d: Diagnostico; compacto?: boolean }) {
  const negativo = d.estado === 'REDUZIR' || d.estado === 'PAUSAR'
  const itens = [
    { icone: CircleAlert, titulo: 'Situação', corpo: <p>{d.situacao}</p> },
    { icone: Search, titulo: 'Evidência', corpo: <ul className="list-disc pl-4 space-y-0.5">{d.evidencias.map(e => <li key={e}>{e}</li>)}</ul> },
    { icone: TrendingDown, titulo: 'Impacto', corpo: <p>{d.impactoTexto}</p> },
    { icone: Target, titulo: 'Ação recomendada', corpo: <p className="font-medium text-tinta">{d.acao}</p> },
  ]
  return (
    <div className={`rounded-xl border ${negativo ? 'border-red-200 bg-red-50/50' : d.estado === 'OTIMIZAR' ? 'border-orange-200 bg-orange-50/40' : d.estado === 'OBSERVAR' ? 'border-amber-200 bg-amber-50/40' : 'border-emerald-200 bg-emerald-50/40'} ${compacto ? 'p-4' : 'p-5'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SeloEstado estado={d.estado} grande />
        <SeloGravidade gravidade={d.gravidade} />
        {d.componente && <span className="rounded-md bg-white px-2 py-0.5 text-xs ring-1 ring-linha">Componente provável: <b>{d.componente}</b></span>}
      </div>
      <div className={`grid gap-4 ${compacto ? '' : 'md:grid-cols-2'}`}>
        {itens.map(({ icone: I, titulo, corpo }) => (
          <div key={titulo} className="flex gap-3 text-sm text-tinta-fraca">
            <I size={18} className="mt-0.5 shrink-0 text-rdb-700" aria-hidden />
            <div className="min-w-0"><p className="mb-0.5 font-semibold text-tinta">{titulo}</p>{corpo}</div>
          </div>
        ))}
      </div>
      {(d.travas.length > 0 || d.proximaReavaliacao) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-3 text-xs text-tinta-fraca">
          {d.travas.map(t => <span key={t} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 ring-1 ring-linha"><Lock size={12} aria-hidden />{t}</span>)}
          {d.proximaReavaliacao && <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 ring-1 ring-linha"><Clock size={12} aria-hidden />Reavaliar em {dataLonga(d.proximaReavaliacao)}</span>}
        </div>
      )}
    </div>
  )
}

/** Áreas executivas da Visão Geral: Precisa de ação / Observar / Oportunidades. */
export function BlocoExecutivo({ tipo, anuncios, qs, total }: { tipo: 'acao' | 'observar' | 'oportunidade'; anuncios: AnuncioPainel[]; qs: string; total: number }) {
  const cfg = {
    acao: { titulo: 'Precisa de ação', cab: 'bg-red-50 text-red-900 border-red-100', icone: ESTILO_ESTADO.REDUZIR.icone, link: 'Ver todos que precisam de ação', aba: 'acao', vazio: 'Nenhum produto precisando de ação agora.' },
    observar: { titulo: 'Observar', cab: 'bg-amber-50 text-amber-900 border-amber-100', icone: ESTILO_ESTADO.OBSERVAR.icone, link: 'Ver todos em observação', aba: 'observar', vazio: 'Nada em observação.' },
    oportunidade: { titulo: 'Oportunidades', cab: 'bg-emerald-50 text-emerald-900 border-emerald-100', icone: ESTILO_ESTADO.ESCALAR.icone, link: 'Ver todas as oportunidades', aba: 'oportunidades', vazio: 'Nenhuma oportunidade de escala agora.' },
  }[tipo]
  const I = cfg.icone
  const sep = qs ? '&' : '?'
  return (
    <section className="card flex flex-col overflow-hidden" aria-label={cfg.titulo}>
      <h2 className={`flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold ${cfg.cab}`}><I size={16} aria-hidden />{cfg.titulo} ({total})</h2>
      <ul className="flex-1 divide-y divide-linha">
        {anuncios.map(a => (
          <li key={a.codigoAnuncio}>
            <Link href={`/recomendacoes${qs}${sep}sel=${encodeURIComponent(a.codigoAnuncio)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-rdb-50/60">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{a.titulo}</p>
                <p className="text-xs text-tinta-fraca">SKU {a.sku ?? '—'}</p>
              </div>
              <SeloEstado estado={a.diagnostico.estado} />
              <div className="w-24 shrink-0 text-right whitespace-nowrap">
                <p className={`text-sm font-semibold tabular-nums ${a.diagnostico.impacto < 0 ? 'text-red-700' : a.diagnostico.impacto > 0 ? 'text-emerald-700' : 'text-tinta-fraca'}`}>
                  {a.diagnostico.impacto === 0 ? '—' : reais(a.diagnostico.impacto, { sinal: true })}
                </p>
                <p className="text-[11px] text-tinta-fraca">{a.diagnostico.impacto < 0 ? 'em risco' : a.diagnostico.impacto > 0 ? 'potencial' : ''}</p>
              </div>
            </Link>
          </li>
        ))}
        {anuncios.length === 0 && <li className="px-4 py-8 text-center text-sm text-tinta-fraca">{cfg.vazio}</li>}
      </ul>
      <Link href={`/recomendacoes${qs}${sep}aba=${cfg.aba}`} className="flex items-center gap-1 border-t border-linha px-4 py-3 text-sm font-medium text-rdb-700 hover:bg-rdb-50">
        {cfg.link} <ArrowRight size={14} aria-hidden />
      </Link>
    </section>
  )
}

/** Barras horizontais simples (uma série → sem legenda; rótulo direto em cada barra). */
export function BarrasHorizontais({ itens, formatar = reais }: { itens: { rotulo: React.ReactNode; valor: number; cor?: string; chave: string }[]; formatar?: (v: number) => string }) {
  const max = Math.max(...itens.map(i => Math.abs(i.valor)), 1)
  const temNegativo = itens.some(i => i.valor < 0)
  return (
    <ul className="space-y-2.5">
      {itens.map(i => (
        <li key={i.chave} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-tinta-fraca">{i.rotulo}</span>
          <span className={`relative h-3.5 ${temNegativo ? '' : ''}`}>
            <span className="absolute inset-y-0 rounded-r" title={formatar(i.valor)}
              style={{ left: 0, width: `${(Math.abs(i.valor) / max) * 100}%`, background: i.cor ?? (i.valor < 0 ? '#dc2626' : '#1baf7a'), borderRadius: 4 }} />
          </span>
          <span className={`tabular-nums font-medium ${i.valor < 0 ? 'text-red-700' : ''}`}>{formatar(i.valor)}</span>
        </li>
      ))}
    </ul>
  )
}

export function Vazio({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center">
      <p className="font-semibold">{titulo}</p>
      {children && <div className="mt-2 text-sm text-tinta-fraca">{children}</div>}
    </div>
  )
}
