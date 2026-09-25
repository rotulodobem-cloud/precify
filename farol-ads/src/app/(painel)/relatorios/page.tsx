import Link from 'next/link'
import Topo from '@/components/Topo'
import GraficoSerie from '@/components/GraficoSerie'
import BotaoExportar from '@/components/BotaoExportar'
import TabelaProdutos from '@/components/TabelaProdutos'
import { BarrasHorizontais } from '@/components/blocos'
import { ESTILO_ESTADO, SeloEstado } from '@/components/selos'
import { Termo } from '@/components/Termo'
import { carregarPainel, type Totais } from '@/lib/dados'
import { lerFiltros, periodoAnterior, queryFiltros } from '@/lib/filtros'
import { dataLonga, pct, pp, reais, variacao } from '@/lib/fmt'
import { ESTADOS } from '@/lib/tipos'

const ABAS = [
  { chave: 'geral', rotulo: 'Visão geral' },
  { chave: 'produto', rotulo: 'Por produto' },
  { chave: 'categoria', rotulo: 'Por categoria' },
  { chave: 'comparativo', rotulo: 'Comparativo de períodos' },
  { chave: 'historico', rotulo: 'Histórico de recomendações' },
]

export default async function Relatorios({ searchParams }: { searchParams: Record<string, string> }) {
  const f = lerFiltros(searchParams)
  const d = await carregarPainel(f)
  const aba = ABAS.find(a => a.chave === searchParams.aba)?.chave ?? 'geral'
  const link = (a: string) => `/relatorios${queryFiltros(f, { aba: a === 'geral' ? null : a })}`

  // Por categoria
  const cats = new Map<string, { receita: number; investimento: number; margemPos: number; n: number }>()
  for (const a of d.anuncios) {
    const k = a.categoria ?? 'Sem categoria'
    const c = cats.get(k) ?? { receita: 0, investimento: 0, margemPos: 0, n: 0 }
    c.receita += a.economia.receitaLiquida; c.investimento += a.investimento; c.margemPos += a.economia.margemPosAds ?? 0; c.n++
    cats.set(k, c)
  }
  const categorias = [...cats.entries()].sort((a, b) => b[1].margemPos - a[1].margemPos)

  const t = d.totais, ant = d.totaisAnteriores
  const pa = periodoAnterior(f)
  const linhasComparativo: { rotulo: string; k: keyof Totais | 'margemPct'; bom: boolean | null; fmt: (v: number | null) => string }[] = [
    { rotulo: 'Receita total', k: 'receitaTotal', bom: true, fmt: v => reais(v) },
    { rotulo: 'Investimento em ads', k: 'investimento', bom: null, fmt: v => reais(v) },
    { rotulo: 'Receita atribuída a ads', k: 'receitaAds', bom: true, fmt: v => reais(v) },
    { rotulo: 'Margem antes de ads', k: 'margemPreAds', bom: true, fmt: v => reais(v) },
    { rotulo: 'Margem após ads', k: 'margemPosAds', bom: true, fmt: v => reais(v) },
    { rotulo: 'TACOS', k: 'tacos', bom: false, fmt: v => pct(v) },
  ]

  return (
    <>
      <Topo titulo="Relatórios" descricao="Análises detalhadas do desempenho dos anúncios, com os mesmos filtros de todas as telas." dados={d} filtros={f}
        acoes={<BotaoExportar tipo="produtos" rotulo="Exportar relatório" />} />
      <nav className="flex gap-1 overflow-x-auto border-b border-linha" aria-label="Tipo de relatório">
        {ABAS.map(a => (
          <Link key={a.chave} href={link(a.chave)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${aba === a.chave ? 'border-rdb-700 font-semibold text-rdb-800' : 'border-transparent text-tinta-fraca hover:text-tinta'}`}>{a.rotulo}</Link>
        ))}
        <Link href={`/campanhas${queryFiltros(f)}`} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-tinta-fraca hover:text-tinta">Por campanha ↗</Link>
      </nav>

      {aba === 'geral' && (
        <section className="grid gap-4 xl:grid-cols-3">
          <div className="card p-5 xl:col-span-2">
            <h2 className="mb-3 font-semibold">Receita atribuída, investimento e margem após ads</h2>
            <GraficoSerie pontos={d.serie} />
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">Margem após ads por categoria</h2>
            <p className="mb-3 text-xs text-tinta-fraca">Onde os ads deixam (ou tiram) dinheiro.</p>
            <BarrasHorizontais itens={categorias.map(([k, c]) => ({ chave: k, rotulo: k, valor: c.margemPos }))} />
          </div>
        </section>
      )}

      {aba === 'produto' && <TabelaProdutos anuncios={d.anuncios} />}

      {aba === 'categoria' && (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-rdb-50/60"><tr>
                <th className="th">Categoria</th><th className="th text-right">Produtos</th><th className="th text-right">Receita total</th>
                <th className="th text-right">Investimento</th><th className="th text-right"><Termo t="TACOS" /></th><th className="th text-right"><Termo t="Margem após ads" /></th>
              </tr></thead>
              <tbody>
                {categorias.map(([k, c]) => (
                  <tr key={k} className={`border-t border-linha ${c.margemPos < 0 ? 'bg-red-50/60' : ''}`}>
                    <td className="td font-medium">{k}</td><td className="td num">{c.n}</td><td className="td num">{reais(c.receita)}</td>
                    <td className="td num">{reais(c.investimento)}</td><td className="td num">{pct(c.receita ? c.investimento / c.receita : null)}</td>
                    <td className={`td num font-semibold ${c.margemPos < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{reais(c.margemPos)}<span className="block text-[11px] font-normal">{pct(c.receita ? c.margemPos / c.receita : null)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {aba === 'comparativo' && (
        <section className="card overflow-hidden">
          <p className="border-b border-linha px-4 py-3 text-sm text-tinta-fraca">
            Período atual ({dataLonga(f.de)} a {dataLonga(f.ate)}) × período anterior de mesmo tamanho ({dataLonga(pa.de)} a {dataLonga(pa.ate)}).
          </p>
          {ant ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="bg-rdb-50/60"><tr><th className="th">Indicador</th><th className="th text-right">Anterior</th><th className="th text-right">Atual</th><th className="th text-right">Variação</th></tr></thead>
                <tbody>
                  {linhasComparativo.map(l => {
                    const va = t[l.k as keyof Totais] as number | null, vb = ant[l.k as keyof Totais] as number | null
                    const pctDiff = l.k === 'tacos' ? (va != null && vb != null ? va - vb : null) : variacao(va, vb)
                    const bom = pctDiff == null || l.bom == null ? null : (pctDiff > 0) === l.bom
                    return (
                      <tr key={l.rotulo} className="border-t border-linha">
                        <td className="td font-medium">{l.rotulo}</td><td className="td num text-tinta-fraca">{l.fmt(vb)}</td><td className="td num font-semibold">{l.fmt(va)}</td>
                        <td className={`td num font-medium ${bom == null ? 'text-tinta-fraca' : bom ? 'text-emerald-700' : 'text-red-700'}`}>{l.k === 'tacos' ? pp(pctDiff) : pct(pctDiff, 0, { sinal: true })}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="px-4 py-8 text-center text-sm text-tinta-fraca">Ainda não há relatório processado no período anterior para comparar.</p>}
        </section>
      )}

      {aba === 'historico' && (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Recomendações por estado</h2>
            <BarrasHorizontais formatar={v => String(v)} itens={ESTADOS.map(e => ({ chave: e, rotulo: ESTILO_ESTADO[e].rotulo, valor: d.historico.filter(h => h.estado === e).length, cor: '#4A8443' }))} />
          </div>
          <div className="card p-5 lg:col-span-2">
            <h2 className="mb-3 font-semibold">O que aconteceu depois</h2>
            <ul className="divide-y divide-linha">
              {d.historico.map(h => {
                const agora = d.anunciosSemFiltroEstado.find(a => a.codigoAnuncio === h.codigoAnuncio)
                return (
                  <li key={h.codigoAnuncio + h.geradoEm} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                    <span className="w-24 text-xs text-tinta-fraca">{dataLonga(h.geradoEm)}</span>
                    <span className="min-w-[140px] flex-1 font-medium">{h.titulo}</span>
                    <SeloEstado estado={h.estado} /><span className="text-xs text-tinta-fraca">({h.status}) → hoje</span>
                    {agora ? <SeloEstado estado={agora.diagnostico.estado} /> : <span className="text-xs text-tinta-fraca">sem ads no período</span>}
                  </li>
                )
              })}
              {d.historico.length === 0 && <li className="py-6 text-center text-sm text-tinta-fraca">Ainda não há histórico.</li>}
            </ul>
          </div>
        </section>
      )}
    </>
  )
}
