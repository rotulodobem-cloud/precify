import { Coins, Megaphone, ShoppingCart, Target, TriangleAlert, Wallet } from 'lucide-react'
import Topo from '@/components/Topo'
import { Kpi } from '@/components/Kpi'
import TabelaCampanhas from '@/components/TabelaCampanhas'
import BotaoExportar from '@/components/BotaoExportar'
import { BarrasHorizontais } from '@/components/blocos'
import { carregarPainel } from '@/lib/dados'
import { lerFiltros } from '@/lib/filtros'
import { num, reais, variacao } from '@/lib/fmt'

export default async function Campanhas({ searchParams }: { searchParams: Record<string, string> }) {
  const f = lerFiltros(searchParams)
  const d = await carregarPainel(f)
  const cs = d.campanhas
  const inv = cs.reduce((s, c) => s + c.investimento, 0)
  const rec = cs.reduce((s, c) => s + c.receita, 0)
  const invAnt = cs.reduce((s, c) => s + (c.anterior?.investimento ?? 0), 0)
  const recAnt = cs.reduce((s, c) => s + (c.anterior?.receita ?? 0), 0)
  const margem = cs.reduce((s, c) => s + (c.margemPosAds ?? 0), 0)
  const semPerformance = cs.filter(c => c.investimento > 0 && (c.receita === 0 || c.estado === 'PAUSAR')).length
  const ativas = cs.filter(c => /ativ/i.test(c.status)).length

  return (
    <>
      <Topo titulo="Campanhas" descricao="Visão por campanha — um agrupamento dos produtos, com margem e recomendação do Farol." dados={d} filtros={f}
        acoes={<BotaoExportar tipo="campanhas" />} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi titulo="Campanhas" icone={Megaphone} valor={String(cs.length)} sub={`${ativas} ativas`} />
        <Kpi titulo="Investimento total" icone={Coins} valor={reais(inv)} variacao={invAnt ? variacao(inv, invAnt) : null} bomQuandoSobe={null} />
        <Kpi titulo="Receita atribuída" termo="Receita atribuída" icone={ShoppingCart} valor={reais(rec)} variacao={recAnt ? variacao(rec, recAnt) : null} />
        <Kpi titulo="ROAS médio" termo="ROAS" icone={Target} valor={num(inv ? rec / inv : null)} sub={invAnt ? `anterior: ${num(recAnt / invAnt)}` : undefined} />
        <Kpi titulo="Margem após ads" termo="Margem após ads" icone={Wallet} valor={reais(margem)} destaque={margem < 0 ? 'negativo' : 'positivo'} sub="das vendas atribuídas" />
        <Kpi titulo="Sem performance" icone={TriangleAlert} valor={String(semPerformance)} destaque={semPerformance ? 'negativo' : undefined} sub="gastando sem retorno" />
      </section>
      <section className="card p-5">
        <h2 className="font-semibold">Margem após ads por campanha</h2>
        <p className="mb-4 text-xs text-tinta-fraca">Vermelho = a campanha está tirando dinheiro; verde = deixando margem.</p>
        <BarrasHorizontais itens={[...cs].sort((a, b) => (a.margemPosAds ?? 0) - (b.margemPosAds ?? 0)).map(c => ({ chave: c.nome, rotulo: c.nome, valor: c.margemPosAds ?? 0 }))} />
      </section>
      <TabelaCampanhas campanhas={cs} />
    </>
  )
}
