import { CircleDollarSign, Package, Percent, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import Topo from '@/components/Topo'
import { Kpi } from '@/components/Kpi'
import TabelaProdutos from '@/components/TabelaProdutos'
import BotaoExportar from '@/components/BotaoExportar'
import { carregarPainel } from '@/lib/dados'
import { lerFiltros } from '@/lib/filtros'
import { pct, pp, reais, variacao } from '@/lib/fmt'

export default async function Produtos({ searchParams }: { searchParams: Record<string, string> }) {
  const f = lerFiltros(searchParams)
  const d = await carregarPainel(f)
  const xs = d.anuncios
  const lucrativos = xs.filter(a => (a.economia.margemPosAds ?? 0) > 0).length
  const prejuizo = xs.filter(a => (a.economia.margemPosAds ?? 0) < 0).length
  const escala = xs.filter(a => a.diagnostico.estado === 'ESCALAR').length
  const t = d.totais, a = d.totaisAnteriores
  const parte = (n: number) => (xs.length ? `${Math.round((n / xs.length) * 100)}% do total` : '')

  return (
    <>
      <Topo titulo="Produtos" descricao="Desempenho por produto/anúncio, com margem real e a recomendação do Farol." dados={d} filtros={f}
        acoes={<BotaoExportar tipo="produtos" />} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi titulo="Produtos com ads" icone={Package} valor={String(xs.length)} sub={t.anunciosSemCusto ? `${t.anunciosSemCusto} sem custo cadastrado` : 'todos com custo'} />
        <Kpi titulo="Margem após ads (total)" termo="Margem após ads" icone={Wallet} valor={reais(t.margemPosAds)} variacao={variacao(t.margemPosAds, a?.margemPosAds)} destaque={t.margemPosAds < 0 ? 'negativo' : undefined} />
        <Kpi titulo="Produtos lucrativos com ads" icone={CircleDollarSign} valor={String(lucrativos)} sub={parte(lucrativos)} />
        <Kpi titulo="Produtos em prejuízo com ads" icone={TrendingDown} valor={String(prejuizo)} sub={parte(prejuizo)} destaque={prejuizo ? 'negativo' : undefined} />
        <Kpi titulo="Oportunidades de escala" icone={TrendingUp} valor={String(escala)} sub={parte(escala)} />
        <Kpi titulo="TACOS médio" termo="TACOS" icone={Percent} valor={pct(t.tacos)} bomQuandoSobe={false}
          variacao={t.tacos != null && a?.tacos != null ? t.tacos - a.tacos : null} rotuloVariacao={t.tacos != null && a?.tacos != null ? pp(t.tacos - a.tacos) : undefined} />
      </section>
      <TabelaProdutos anuncios={xs} />
    </>
  )
}
