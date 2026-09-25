import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import Topo from '@/components/Topo'
import GraficoSerie from '@/components/GraficoSerie'
import { BlocoDiagnostico } from '@/components/blocos'
import { SeloEstado, SeloGravidade, SeloStatus } from '@/components/selos'
import { Termo, type TermoGlossario } from '@/components/Termo'
import { carregarPainel, serieDoAnuncio } from '@/lib/dados'
import { lerFiltros, queryFiltros } from '@/lib/filtros'
import { dataHora, dataLonga, inteiro, num, pct, pp, reais, variacao } from '@/lib/fmt'
import { nomeCanal } from '@/lib/tipos'

function Metrica({ titulo, termo, valor, sub, ruim }: { titulo: string; termo?: TermoGlossario; valor: string; sub?: string; ruim?: boolean }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-tinta-fraca">{termo ? <Termo t={termo}>{titulo}</Termo> : titulo}</p>
      <p className={`mt-1 whitespace-nowrap text-xl font-bold tabular-nums ${ruim ? 'text-red-700' : ''}`}>{valor}</p>
      {sub && <p className="text-xs text-tinta-fraca">{sub}</p>}
    </div>
  )
}

export default async function DetalheProduto({ params, searchParams }: { params: { codigo: string }; searchParams: Record<string, string> }) {
  const f = lerFiltros(searchParams)
  const d = await carregarPainel({ ...f, estado: null })
  const codigo = decodeURIComponent(params.codigo)
  const a = d.anuncios.find(x => x.codigoAnuncio === codigo)
  if (!a) notFound()
  const e = a.economia
  const serie = await serieDoAnuncio(f, a.codigoAnuncio, e.margemPreAdsPct)
  const qs = queryFiltros(f)
  const historico = d.historico.filter(h => h.codigoAnuncio === codigo)
  const alertas = d.alertas.filter(x => x.codigoAnuncio === codigo)
  const ant = a.anterior
  const roasAnt = ant?.investimento ? (ant.receitaAds ?? 0) / ant.investimento : null
  const acosAnt = ant?.receitaAds ? (ant.investimento ?? 0) / ant.receitaAds : null

  const conta: { rotulo: string; valor: number | null; nota?: string; forte?: boolean }[] = [
    { rotulo: 'Receita líquida do produto', valor: e.receitaLiquida, nota: a.receitaTotal == null ? 'sem vendas do Bling: usando receita atribuída a ads' : 'ads + orgânico, no canal' },
    { rotulo: '− Custo direto (Precify)', valor: e.custoDireto == null ? null : -e.custoDireto, nota: e.custoNaoCadastrado ? 'custo não cadastrado' : `${a.unidades ?? e.vendas} un. × ${reais(a.custoUnitario)}` },
    { rotulo: '− Imposto', valor: -e.impostoValor, nota: pct(a.impostoPct, 2) },
    { rotulo: '− Comissão do canal', valor: -e.comissaoValor, nota: pct(a.comissaoPct) },
    { rotulo: '− Taxa fixa do canal', valor: -e.taxaFixaValor },
    { rotulo: '− Frete pago pela empresa', valor: e.freteEmpresaValor == null ? null : -e.freteEmpresaValor, nota: e.freteEmpresaValor == null ? 'não incluído (sem dado por SKU)' : undefined },
    { rotulo: '= Margem antes de ads', valor: e.margemPreAds, nota: pct(e.margemPreAdsPct), forte: true },
    { rotulo: '− Investimento em ads', valor: -a.investimento },
    { rotulo: '= Margem após ads', valor: e.margemPosAds, nota: pct(e.margemPosAdsPct), forte: true },
  ]

  return (
    <>
      <nav className="flex items-center gap-1 text-sm text-tinta-fraca" aria-label="Trilha">
        <Link href={`/produtos${qs}`} className="inline-flex items-center gap-1 hover:text-rdb-700"><ChevronLeft size={15} aria-hidden />Produtos</Link>
        <span>/</span><span className="text-tinta">{a.titulo}</span>
      </nav>
      <Topo titulo={a.titulo} descricao={`SKU ${a.sku ?? '—'} · anúncio ${a.codigoAnuncio} · ${nomeCanal(a.canal)}${a.categoria ? ` · ${a.categoria}` : ''}`} dados={d} filtros={f}
        acoes={a.canal === 'mercado_livre' && /^MLB\d+$/.test(a.codigoAnuncio) ? (
          <a className="btn-secundario" target="_blank" rel="noreferrer" href={`https://produto.mercadolivre.com.br/MLB-${a.codigoAnuncio.slice(3)}`}>Ver no Mercado Livre <ExternalLink size={14} aria-hidden /></a>
        ) : undefined} />

      <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
            <Metrica titulo="Receita total" termo="Receita total" valor={reais(e.receitaLiquida)} sub={variacao(e.receitaLiquida, ant?.receitaTotal) != null ? `${pct(variacao(e.receitaLiquida, ant?.receitaTotal), 0, { sinal: true })} vs. anterior` : undefined} />
            <Metrica titulo="Investimento em ads" valor={reais(a.investimento)} sub={variacao(a.investimento, ant?.investimento) != null ? `${pct(variacao(a.investimento, ant?.investimento), 0, { sinal: true })} vs. anterior` : undefined} />
            <Metrica titulo="Receita atribuída" termo="Receita atribuída" valor={reais(a.receitaAds)} sub={`${e.vendas} vendas (${a.vendasDiretas} diretas)`} />
            <Metrica titulo="Margem antes de ads" termo="Margem antes de ads" valor={reais(e.margemPreAds)} sub={pct(e.margemPreAdsPct)} />
            <Metrica titulo="Margem após ads" termo="Margem após ads" valor={reais(e.margemPosAds)} sub={pct(e.margemPosAdsPct)} ruim={(e.margemPosAds ?? 0) < 0} />
          </div>
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">ROAS: meta publicitária × viabilidade econômica</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
              <Metrica titulo="ROAS atual" termo="ROAS" valor={num(e.roas)} sub={roasAnt != null && e.roas != null ? `${e.roas >= roasAnt ? '↑' : '↓'} ${num(Math.abs(e.roas - roasAnt))} vs. anterior` : undefined} ruim={e.roas != null && e.roasEquilibrio != null && e.roas < e.roasEquilibrio} />
              <Metrica titulo="ROAS objetivo" termo="ROAS objetivo" valor={num(a.roasObjetivo)} sub="meta da campanha no ML" />
              <Metrica titulo="ROAS equilíbrio" termo="ROAS de equilíbrio" valor={num(e.roasEquilibrio)} sub="abaixo disso, prejuízo" />
              <Metrica titulo="ACOS atual" termo="ACOS" valor={pct(e.acos)} sub={acosAnt != null && e.acos != null ? `${pp(e.acos - acosAnt)} vs. anterior` : undefined} ruim={e.acos != null && e.acosEquilibrio != null && e.acos > e.acosEquilibrio} />
              <Metrica titulo="ACOS equilíbrio" termo="ACOS de equilíbrio" valor={pct(e.acosEquilibrio)} />
              <Metrica titulo="TACOS" termo="TACOS" valor={pct(e.tacos)} />
              <Metrica titulo="Conversão" termo="CVR" valor={pct(e.cvr, 2)} sub={`CTR ${pct(e.ctr, 2)} · CPC ${reais(e.cpc)}`} />
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">Evolução</h2>
            <p className="mb-3 text-xs text-tinta-fraca">{d.fonte === 'supabase' ? 'Um ponto por relatório de anúncios processado.' : 'Diário (dados de demonstração).'}</p>
            <GraficoSerie pontos={serie} altura={220} />
          </div>
        </div>

        <aside className="space-y-4">
          <BlocoDiagnostico d={a.diagnostico} compacto />
          {a.decisaoCalculadaNoPainel && d.fonte === 'supabase' && (
            <p className="text-xs text-amber-800">A ingestão ainda não gravou a decisão desta captura; o painel aplicou o mesmo motor para exibir.</p>
          )}
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Como a margem é calculada</h2>
            <dl className="divide-y divide-linha text-sm">
              {conta.map(c => (
                <div key={c.rotulo} className={`flex items-baseline justify-between gap-3 py-1.5 ${c.forte ? 'font-semibold' : ''}`}>
                  <dt className="min-w-0">{c.rotulo}{c.nota && <span className="block text-[11px] font-normal text-tinta-fraca">{c.nota}</span>}</dt>
                  <dd className={`tabular-nums ${c.valor != null && c.valor < 0 && c.forte ? 'text-red-700' : ''}`}>{c.valor == null ? '—' : reais(c.valor)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-tinta-fraca">Margem não é lucro: despesas fixas da empresa não entram nesse cálculo.</p>
          </div>
        </aside>
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-linha px-4 py-3 font-semibold">Campanhas em que este anúncio aparece</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-rdb-50/60"><tr>
              <th className="th">Campanha</th><th className="th">Status</th><th className="th text-right">Impressões</th><th className="th text-right">Cliques</th>
              <th className="th text-right">Investimento</th><th className="th text-right">Receita atribuída</th><th className="th text-right">Vendas</th><th className="th text-right"><Termo t="ROAS" /></th>
            </tr></thead>
            <tbody>
              {a.porCampanha.map(c => (
                <tr key={c.nome} className="border-t border-linha">
                  <td className="td"><Link href={`/campanhas${queryFiltros(f, { campanha: c.nome })}`} className="font-medium hover:text-rdb-700 hover:underline">{c.nome}</Link></td>
                  <td className="td">{c.status ? <SeloStatus status={c.status} /> : '—'}</td>
                  <td className="td num">{inteiro(c.impressoes)}</td><td className="td num">{inteiro(c.cliques)}</td>
                  <td className="td num">{reais(c.investimento)}</td><td className="td num">{reais(c.receitaAds)}</td>
                  <td className="td num">{c.vendas}</td><td className="td num">{c.investimento ? num(c.receitaAds / c.investimento) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {a.porCampanha.length > 1 && <p className="border-t border-linha px-4 py-2 text-xs text-tinta-fraca">Um anúncio pode performar bem dentro de uma campanha genérica e mal (ou nada) na campanha com o próprio nome — compare as linhas acima.</p>}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <h2 className="border-b border-linha px-4 py-3 font-semibold">Histórico de recomendações</h2>
          <ul className="divide-y divide-linha">
            {historico.map(h => (
              <li key={h.geradoEm} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="w-28 text-xs text-tinta-fraca">{dataLonga(h.geradoEm)}</span>
                <SeloEstado estado={h.estado} /><SeloGravidade gravidade={h.gravidade} />
                <span className="flex-1 min-w-[160px]">{h.acao}</span>
                <SeloStatus status={h.status} />
              </li>
            ))}
            {historico.length === 0 && <li className="px-4 py-6 text-sm text-tinta-fraca">Nenhuma recomendação anterior.</li>}
          </ul>
        </div>
        <div className="card overflow-hidden">
          <h2 className="border-b border-linha px-4 py-3 font-semibold">Alertas deste anúncio</h2>
          <ul className="divide-y divide-linha">
            {alertas.map(x => (
              <li key={x.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-tinta-fraca">{dataHora(x.criadoEm)}</span><SeloGravidade gravidade={x.gravidade} /><SeloStatus status={x.status} /></div>
                <p className="mt-1 font-medium">{x.problema}</p><p className="text-tinta-fraca">{x.acao}</p>
              </li>
            ))}
            {alertas.length === 0 && <li className="px-4 py-6 text-sm text-tinta-fraca">Nenhum alerta.</li>}
          </ul>
        </div>
      </section>
    </>
  )
}
