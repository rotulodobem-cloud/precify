'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ArrowUpDown, Search, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AnuncioPainel } from '@/lib/dados'
import { num, pct, reais, variacao } from '@/lib/fmt'
import { SeloCanal, SeloEstado, SeloGravidade } from './selos'
import { Termo, type TermoGlossario } from './Termo'

type Chave = 'produto' | 'receitaTotal' | 'investimento' | 'receitaAds' | 'margemPre' | 'margemPos' | 'roas' | 'acos' | 'tacos' | 'estado' | 'gravidade' | 'impacto'

const ORDEM_ESTADO = { PAUSAR: 0, REDUZIR: 1, OTIMIZAR: 2, OBSERVAR: 3, ESCALAR: 4, MANTER: 5 }
const ORDEM_GRAV = { CRITICO: 0, IMPORTANTE: 1, ATENCAO: 2, INFORMATIVO: 3 }

const valor = (a: AnuncioPainel, k: Chave): number | string => {
  switch (k) {
    case 'produto': return a.titulo.toLowerCase()
    case 'receitaTotal': return a.economia.receitaLiquida
    case 'investimento': return a.investimento
    case 'receitaAds': return a.receitaAds
    case 'margemPre': return a.economia.margemPreAds ?? -Infinity
    case 'margemPos': return a.economia.margemPosAds ?? -Infinity
    case 'roas': return a.economia.roas ?? -Infinity
    case 'acos': return a.economia.acos ?? Infinity
    case 'tacos': return a.economia.tacos ?? Infinity
    case 'estado': return ORDEM_ESTADO[a.diagnostico.estado]
    case 'gravidade': return ORDEM_GRAV[a.diagnostico.gravidade]
    case 'impacto': return a.diagnostico.impacto
  }
}

const COLUNAS: { k: Chave; rotulo: string; termo?: TermoGlossario; num?: boolean }[] = [
  { k: 'produto', rotulo: 'Produto' },
  { k: 'receitaTotal', rotulo: 'Receita total', termo: 'Receita total', num: true },
  { k: 'investimento', rotulo: 'Invest. ads', num: true },
  { k: 'receitaAds', rotulo: 'Receita ads', termo: 'Receita atribuída', num: true },
  { k: 'margemPre', rotulo: 'Margem antes', termo: 'Margem antes de ads', num: true },
  { k: 'margemPos', rotulo: 'Margem após ads', termo: 'Margem após ads', num: true },
  { k: 'roas', rotulo: 'ROAS', termo: 'ROAS', num: true },
  { k: 'acos', rotulo: 'ACOS', termo: 'ACOS', num: true },
  { k: 'tacos', rotulo: 'TACOS', termo: 'TACOS', num: true },
  { k: 'estado', rotulo: 'Recomendação', termo: 'Estado' },
  { k: 'gravidade', rotulo: 'Gravidade', termo: 'Gravidade' },
  { k: 'impacto', rotulo: 'Impacto est.', termo: 'Impacto estimado', num: true },
]

function Var({ atual, anterior, invertido = false }: { atual: number | null; anterior: number | null | undefined; invertido?: boolean }) {
  const v = variacao(atual, anterior)
  if (v == null) return null
  const bom = invertido ? v < 0 : v > 0
  return (
    <span className={`flex items-center justify-end gap-0.5 text-[11px] ${bom ? 'text-emerald-700' : 'text-red-700'}`}>
      {v > 0 ? <ArrowUp size={10} aria-hidden /> : <ArrowDown size={10} aria-hidden />}{pct(Math.abs(v), 0)}
    </span>
  )
}

export default function TabelaProdutos({ anuncios, ordemInicial = 'margemPos', compacta = false, porPagina = 20 }: {
  anuncios: AnuncioPainel[]; ordemInicial?: Chave; compacta?: boolean; porPagina?: number
}) {
  const sp = useSearchParams()
  const [ordem, setOrdem] = useState<{ k: Chave; asc: boolean }>({ k: ordemInicial, asc: ordemInicial === 'margemPos' || ordemInicial === 'impacto' })
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase()
    const xs = b ? anuncios.filter(a => `${a.titulo} ${a.sku ?? ''} ${a.codigoAnuncio} ${a.campanhas.join(' ')}`.toLowerCase().includes(b)) : anuncios
    return [...xs].sort((x, y) => {
      const a = valor(x, ordem.k), c = valor(y, ordem.k)
      const r = typeof a === 'string' ? a.localeCompare(c as string) : (a as number) - (c as number)
      return ordem.asc ? r : -r
    })
  }, [anuncios, busca, ordem])

  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const pag = Math.min(pagina, paginas - 1)
  const visiveis = filtrados.slice(pag * porPagina, (pag + 1) * porPagina)
  const qs = sp.toString() ? `?${sp}` : ''
  const colunas = compacta ? COLUNAS.filter(c => !['receitaAds', 'margemPre', 'tacos'].includes(c.k)) : COLUNAS

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-linha px-4 py-3">
        <label className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-fraca" aria-hidden />
          <input className="campo w-full pl-9" placeholder="Buscar produto, SKU, anúncio ou campanha…" value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(0) }} aria-label="Buscar na tabela" />
        </label>
        <p className="text-xs text-tinta-fraca">Clique no título da coluna para ordenar. Linhas em vermelho: margem após ads negativa.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="bg-rdb-50/60 border-b border-linha">
            <tr>
              <th className="th w-10"><span className="sr-only">Canal</span></th>
              {colunas.map(c => {
                const ativo = ordem.k === c.k
                return (
                  <th key={c.k} className={`th ${c.num ? 'text-right' : ''}`} aria-sort={ativo ? (ordem.asc ? 'ascending' : 'descending') : 'none'}>
                    <span className={`inline-flex items-center gap-1 ${c.num ? 'justify-end' : ''}`}>
                      <button type="button" className="inline-flex items-center gap-1 hover:text-tinta" onClick={() => setOrdem({ k: c.k, asc: ativo ? !ordem.asc : c.k === 'produto' })}>
                        {c.rotulo}
                        {ativo ? (ordem.asc ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />) : <ArrowUpDown size={12} className="opacity-40" aria-hidden />}
                      </button>
                      {c.termo && <Termo t={c.termo} alinhar={c.k === 'impacto' ? 'direita' : 'centro'}>{''}</Termo>}
                    </span>
                  </th>
                )
              })}
              <th className="th"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map(a => {
              const e = a.economia
              const negativo = (e.margemPosAds ?? 0) < 0
              return (
                <tr key={`${a.canal}-${a.codigoAnuncio}`} className={`border-b border-linha last:border-0 ${negativo ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-rdb-50/50'}`}>
                  <td className="td"><SeloCanal canal={a.canal} /></td>
                  <td className="td max-w-[240px]">
                    <Link href={`/produtos/${encodeURIComponent(a.codigoAnuncio)}${qs}`} className="block truncate font-medium text-tinta hover:text-rdb-700 hover:underline">{a.titulo}</Link>
                    <p className="text-xs text-tinta-fraca truncate">SKU {a.sku ?? '—'} · {a.codigoAnuncio}{a.campanhas.length > 1 ? ` · ${a.campanhas.length} campanhas` : ''}</p>
                  </td>
                  <td className="td num">{reais(e.receitaLiquida)}<Var atual={e.receitaLiquida} anterior={a.anterior?.receitaTotal} /></td>
                  <td className="td num">{reais(a.investimento)}<Var atual={a.investimento} anterior={a.anterior?.investimento} invertido /></td>
                  {!compacta && <td className="td num">{reais(a.receitaAds)}</td>}
                  {!compacta && <td className="td num">{e.custoNaoCadastrado ? <span className="text-xs text-amber-800">sem custo</span> : <>{reais(e.margemPreAds)}<span className="block text-[11px] text-tinta-fraca">{pct(e.margemPreAdsPct)}</span></>}</td>}
                  <td className={`td num font-semibold ${e.margemPosAds == null ? '' : negativo ? 'text-red-700' : 'text-emerald-700'}`}>
                    {e.custoNaoCadastrado ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800"><TriangleAlert size={12} aria-hidden />custo não cadastrado</span>
                      : <>{reais(e.margemPosAds)}<span className="block text-[11px] font-normal">{pct(e.margemPosAdsPct)}{e.margemParcial ? '*' : ''}</span></>}
                  </td>
                  <td className={`td num ${e.roas != null && e.roasEquilibrio != null && e.roas < e.roasEquilibrio ? 'text-red-700' : ''}`}>
                    {num(e.roas)}<span className="block text-[11px] text-tinta-fraca">equil. {num(e.roasEquilibrio)}</span>
                  </td>
                  <td className={`td num ${e.acos != null && e.acosEquilibrio != null && e.acos > e.acosEquilibrio ? 'text-red-700' : ''}`}>{pct(e.acos)}</td>
                  {!compacta && <td className="td num">{pct(e.tacos)}</td>}
                  <td className="td"><SeloEstado estado={a.diagnostico.estado} /></td>
                  <td className="td"><SeloGravidade gravidade={a.diagnostico.gravidade} /></td>
                  <td className={`td num font-medium ${a.diagnostico.impacto < 0 ? 'text-red-700' : a.diagnostico.impacto > 0 ? 'text-emerald-700' : 'text-tinta-fraca'}`}>
                    {a.diagnostico.impacto === 0 ? '—' : reais(a.diagnostico.impacto, { sinal: true })}
                  </td>
                  <td className="td"><Link href={`/produtos/${encodeURIComponent(a.codigoAnuncio)}${qs}`} className="btn-secundario py-1 px-2.5 text-xs">Detalhes</Link></td>
                </tr>
              )
            })}
            {visiveis.length === 0 && <tr><td colSpan={colunas.length + 2} className="py-10 text-center text-sm text-tinta-fraca">Nenhum produto com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linha px-4 py-3 text-sm text-tinta-fraca">
        <span>Mostrando {filtrados.length === 0 ? 0 : pag * porPagina + 1}–{Math.min((pag + 1) * porPagina, filtrados.length)} de {filtrados.length} produtos{anuncios.some(a => a.economia.margemParcial) ? ' · * margem parcial (frete da empresa não incluído)' : ''}</span>
        {paginas > 1 && (
          <div className="flex gap-1">
            {Array.from({ length: paginas }, (_, i) => (
              <button key={i} onClick={() => setPagina(i)} aria-current={i === pag ? 'page' : undefined}
                className={`h-8 min-w-8 rounded-md px-2 text-sm ${i === pag ? 'bg-rdb-800 text-white' : 'hover:bg-rdb-50'}`}>{i + 1}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
