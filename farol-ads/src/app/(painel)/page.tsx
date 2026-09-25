import { BadgeDollarSign, Bell, Megaphone, Percent, ShoppingCart, Wallet } from 'lucide-react'
import Link from 'next/link'
import Topo from '@/components/Topo'
import { Kpi } from '@/components/Kpi'
import GraficoSerie from '@/components/GraficoSerie'
import { BarrasHorizontais, BlocoExecutivo } from '@/components/blocos'
import { ESTILO_ESTADO, ESTILO_GRAVIDADE } from '@/components/selos'
import { Termo } from '@/components/Termo'
import { carregarPainel, type AnuncioPainel } from '@/lib/dados'
import { lerFiltros, queryFiltros } from '@/lib/filtros'
import { pct, pp, reais, variacao } from '@/lib/fmt'
import { GRAVIDADES, type Estado } from '@/lib/tipos'

const COR_ESTADO: Record<Estado, string> = {
  ESCALAR: '#059669', MANTER: '#16a34a', OBSERVAR: '#f59e0b', OTIMIZAR: '#f97316', REDUZIR: '#dc2626', PAUSAR: '#991b1b',
}

export default async function VisaoGeral({ searchParams }: { searchParams: Record<string, string> }) {
  const f = lerFiltros(searchParams)
  const d = await carregarPainel(f)
  const t = d.totais, a = d.totaisAnteriores
  const qs = queryFiltros(f)

  const acao = d.anuncios.filter(x => ['REDUZIR', 'PAUSAR', 'OTIMIZAR'].includes(x.diagnostico.estado))
    .sort((x, y) => x.diagnostico.impacto - y.diagnostico.impacto)
  const observar = d.anuncios.filter(x => x.diagnostico.estado === 'OBSERVAR')
    .sort((x, y) => (x.economia.margemPosAds ?? 0) - (y.economia.margemPosAds ?? 0))
  // Oportunidades: margem disponível × volume × estabilidade (sem piora vs. período anterior)
  const nota = (x: AnuncioPainel) => (x.economia.margemPosAds ?? 0) * Math.min(1, x.economia.vendas / 50)
    * ((x.anterior?.margemPosAds ?? 0) > 0 ? 1.1 : 1)
  const oportunidades = d.anuncios.filter(x => x.diagnostico.estado === 'ESCALAR').sort((x, y) => nota(y) - nota(x))

  const porEstado = (Object.keys(ESTILO_ESTADO) as Estado[]).map(e => {
    const xs = d.anuncios.filter(x => x.diagnostico.estado === e)
    return { e, n: xs.length, investimento: xs.reduce((s, x) => s + x.investimento, 0), margem: xs.reduce((s, x) => s + (x.economia.margemPosAds ?? 0), 0) }
  }).filter(x => x.n > 0)

  const alertasAbertos = d.alertas.filter(x => x.status !== 'resolvido')
  const margemPrePct = t.receitaTotal ? t.margemPreAds / t.receitaTotal : null
  const margemPosPct = t.receitaTotal ? t.margemPosAds / t.receitaTotal : null

  return (
    <>
      <Topo titulo="Visão Geral" descricao="Onde você está ganhando e onde está perdendo dinheiro com ads, produto por produto." dados={d} filtros={f} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores do período">
        <Kpi titulo="Receita total" termo="Receita total" icone={BadgeDollarSign} valor={reais(t.receitaTotal)} variacao={variacao(t.receitaTotal, a?.receitaTotal)} />
        <Kpi titulo="Investimento em ads" icone={Megaphone} valor={reais(t.investimento)} variacao={variacao(t.investimento, a?.investimento)} bomQuandoSobe={null} />
        <Kpi titulo="Receita atribuída a ads" termo="Receita atribuída" icone={ShoppingCart} valor={reais(t.receitaAds)} variacao={variacao(t.receitaAds, a?.receitaAds)} />
        <Kpi titulo="Margem antes de ads" termo="Margem antes de ads" icone={Wallet} valor={reais(t.margemPreAds)} sub={`${pct(margemPrePct)} da receita`} />
        <Kpi titulo="Margem após ads" termo="Margem após ads" icone={Wallet} valor={reais(t.margemPosAds)} destaque={t.margemPosAds < 0 ? 'negativo' : 'positivo'}
          variacao={variacao(t.margemPosAds, a?.margemPosAds)} sub={`${pct(margemPosPct)} da receita`} />
        <Kpi titulo="TACOS" termo="TACOS" icone={Percent} valor={pct(t.tacos)} bomQuandoSobe={false}
          variacao={t.tacos != null && a?.tacos != null ? t.tacos - a.tacos : null} rotuloVariacao={t.tacos != null && a?.tacos != null ? pp(t.tacos - a.tacos) : undefined} />
      </section>
      {t.anunciosSemCusto > 0 && (
        <p className="-mt-3 text-xs text-amber-800">{t.anunciosSemCusto} anúncio(s) sem custo no Precify ficaram fora das margens. Margem não é lucro: despesas fixas da empresa não entram nesse cálculo.</p>
      )}

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <h2 className="font-semibold">Evolução no período</h2>
          <p className="mb-3 text-xs text-tinta-fraca">Quanto os ads venderam, quanto custaram e quanto sobrou de margem.</p>
          <GraficoSerie pontos={d.serie} />
        </div>
        <div className="card p-5 space-y-5">
          <div>
            <h2 className="font-semibold">Para onde vai o investimento</h2>
            <p className="mb-3 text-xs text-tinta-fraca">Investimento em ads por <Termo t="Estado">recomendação do Farol</Termo></p>
            <BarrasHorizontais itens={porEstado.map(x => {
              const I = ESTILO_ESTADO[x.e].icone
              return { chave: x.e, valor: x.investimento, cor: COR_ESTADO[x.e], rotulo: <span className="inline-flex items-center gap-1.5"><I size={13} aria-hidden />{ESTILO_ESTADO[x.e].rotulo} ({x.n})</span> }
            })} />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Margem após ads por recomendação</h3>
            <div className="mt-2"><BarrasHorizontais itens={porEstado.map(x => ({ chave: x.e, valor: x.margem, rotulo: ESTILO_ESTADO[x.e].rotulo }))} /></div>
          </div>
          <Link href={`/alertas${qs}`} className="flex items-center justify-between rounded-lg border border-linha px-3 py-2.5 hover:bg-rdb-50">
            <span className="flex items-center gap-2 text-sm font-medium"><Bell size={15} aria-hidden />Alertas abertos</span>
            <span className="flex gap-1.5">
              {GRAVIDADES.map(g => {
                const n = alertasAbertos.filter(x => x.gravidade === g).length
                if (!n) return null
                const G = ESTILO_GRAVIDADE[g]
                return <span key={g} title={G.rotulo} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${G.classe}`}><G.icone size={11} aria-hidden />{n}<span className="sr-only">{G.rotulo}</span></span>
              })}
            </span>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Áreas executivas">
        <BlocoExecutivo tipo="acao" anuncios={acao.slice(0, 4)} total={acao.length} qs={qs} />
        <BlocoExecutivo tipo="observar" anuncios={observar.slice(0, 4)} total={observar.length} qs={qs} />
        <BlocoExecutivo tipo="oportunidade" anuncios={oportunidades.slice(0, 4)} total={oportunidades.length} qs={qs} />
      </section>
    </>
  )
}
