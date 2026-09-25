'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useState } from 'react'
import type { CampanhaResumo } from '@/lib/tipos'
import { inteiro, num, pct, reais, variacao } from '@/lib/fmt'
import { SeloCanal, SeloEstado, SeloGravidade, SeloStatus } from './selos'
import { Termo } from './Termo'

type K = 'nome' | 'orcamento' | 'investimento' | 'receita' | 'roas' | 'margem' | 'anuncios' | 'vendas'
const val = (c: CampanhaResumo, k: K): number | string => ({
  nome: c.nome.toLowerCase(), orcamento: c.orcamento ?? -1, investimento: c.investimento, receita: c.receita,
  roas: c.investimento ? c.receita / c.investimento : -1, margem: c.margemPosAds ?? -Infinity, anuncios: c.anuncios, vendas: c.vendas,
}[k])

export default function TabelaCampanhas({ campanhas }: { campanhas: CampanhaResumo[] }) {
  const sp = useSearchParams()
  const [o, setO] = useState<{ k: K; asc: boolean }>({ k: 'investimento', asc: false })
  const xs = [...campanhas].sort((a, b) => {
    const x = val(a, o.k), y = val(b, o.k)
    const r = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
    return o.asc ? r : -r
  })
  const Th = ({ k, children, direita = true }: { k: K; children: React.ReactNode; direita?: boolean }) => (
    <th className={`th ${direita ? 'text-right' : ''}`} aria-sort={o.k === k ? (o.asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-tinta" onClick={() => setO({ k, asc: o.k === k ? !o.asc : k === 'nome' })}>
        {children}{o.k === k ? (o.asc ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />) : <ArrowUpDown size={12} className="opacity-40" aria-hidden />}
      </button>
    </th>
  )
  const link = (nome: string) => {
    const q = new URLSearchParams(sp.toString()); q.set('campanha', nome)
    return `/produtos?${q}`
  }
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="bg-rdb-50/60 border-b border-linha"><tr>
            <th className="th w-10"><span className="sr-only">Canal</span></th>
            <Th k="nome" direita={false}>Campanha</Th>
            <th className="th">Status</th>
            <Th k="orcamento">Orçamento/dia</Th>
            <Th k="investimento">Investimento</Th>
            <Th k="receita">Receita atribuída</Th>
            <Th k="roas">ROAS · meta</Th>
            <Th k="margem">Margem após ads</Th>
            <Th k="anuncios">Anúncios</Th>
            <th className="th"><Termo t="Estado">Recomendação</Termo></th>
            <th className="th">Gravidade</th>
            <th className="th"><span className="sr-only">Ações</span></th>
          </tr></thead>
          <tbody>
            {xs.map(c => {
              const roas = c.investimento ? c.receita / c.investimento : null
              const neg = (c.margemPosAds ?? 0) < 0
              const vi = variacao(c.investimento, c.anterior?.investimento), vr = variacao(c.receita, c.anterior?.receita)
              return (
                <tr key={c.nome} className={`border-b border-linha last:border-0 ${neg ? 'bg-red-50/60' : 'hover:bg-rdb-50/50'}`}>
                  <td className="td"><SeloCanal canal={c.canal} /></td>
                  <td className="td max-w-[260px]"><Link href={link(c.nome)} className="block truncate font-medium hover:text-rdb-700 hover:underline">{c.nome}</Link>
                    <span className="block truncate text-xs text-tinta-fraca">{inteiro(c.impressoes)} impressões · {inteiro(c.cliques)} cliques · {c.vendas} vendas</span></td>
                  <td className="td"><SeloStatus status={c.status} /></td>
                  <td className="td num">{c.orcamento == null ? '—' : reais(c.orcamento)}</td>
                  <td className="td num">{reais(c.investimento)}{vi != null && <span className="block text-[11px] text-tinta-fraca">{pct(vi, 0, { sinal: true })}</span>}</td>
                  <td className="td num">{reais(c.receita)}{vr != null && <span className={`block text-[11px] ${vr >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{pct(vr, 0, { sinal: true })}</span>}</td>
                  <td className="td num">{num(roas)}<span className="block text-[11px] text-tinta-fraca">meta {num(c.roasObjetivo)}</span></td>
                  <td className={`td num font-semibold ${c.margemPosAds == null ? '' : neg ? 'text-red-700' : 'text-emerald-700'}`}>{reais(c.margemPosAds)}<span className="block text-[11px] font-normal">{pct(c.margemPosAdsPct)}</span></td>
                  <td className="td num">{c.anuncios}</td>
                  <td className="td"><SeloEstado estado={c.estado} /></td>
                  <td className="td"><SeloGravidade gravidade={c.gravidade} /></td>
                  <td className="td"><Link href={link(c.nome)} className="btn-secundario py-1 px-2.5 text-xs">Ver anúncios</Link></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-linha px-4 py-2 text-xs text-tinta-fraca">
        Campanha é um agrupamento dos anúncios: a margem soma a margem das vendas atribuídas de cada anúncio menos o investimento. A recomendação reflete o anúncio mais crítico dentro dela.
      </p>
    </div>
  )
}
