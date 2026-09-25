import Link from 'next/link'
import { BellRing, CircleCheck, Clock, TrendingDown } from 'lucide-react'
import Topo from '@/components/Topo'
import BotaoExportar from '@/components/BotaoExportar'
import { SeloCanal, SeloEstado, SeloStatus } from '@/components/selos'
import { carregarPainel } from '@/lib/dados'
import { lerFiltros, queryFiltros } from '@/lib/filtros'
import { dataLonga, pct, reais } from '@/lib/fmt'

const ABAS = [
  { chave: null, rotulo: 'Todas' },
  { chave: 'encerrada', rotulo: 'Encerradas' },
  { chave: 'ativa', rotulo: 'Ativas' },
] as const

export default async function Promocoes({ searchParams }: { searchParams: Record<string, string> }) {
  const f = lerFiltros(searchParams)
  const d = await carregarPainel(f)
  const status = ABAS.find(a => a.chave === searchParams.status)?.chave ?? null
  // Promoções que estiveram ativas em algum momento do período
  const doPeriodo = d.promocoes.filter(p => p.desde <= f.ate && (p.encerradaEm == null || p.encerradaEm >= f.de))
  const lista = doPeriodo.filter(p => !status || p.status === status)
    .sort((a, b) => (a.status === b.status ? (b.encerradaEm ?? b.desde).localeCompare(a.encerradaEm ?? a.desde) : a.status === 'encerrada' ? -1 : 1))
  const encerradas = doPeriodo.filter(p => p.status === 'encerrada')
  const encerradasSemana = encerradas.filter(p => p.encerradaEm && new Date(f.ate).getTime() - new Date(p.encerradaEm).getTime() <= 7 * 86_400_000)
  const ativas = doPeriodo.filter(p => p.status === 'ativa')
  const link = (extra: Record<string, string | null>) => `/promocoes${queryFiltros(f, { status, ...extra })}`
  const estadoDe = (item: string) => d.anuncios.find(a => a.codigoAnuncio === item)

  return (
    <>
      <Topo titulo="Promoções" descricao="O que está e o que deixou de estar em promoção ativa no Mercado Livre, com histórico." dados={d} filtros={f}
        acoes={<BotaoExportar tipo="promocoes" />} />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href={link({ status: 'encerrada' })} className="rounded-xl bg-red-50 p-4 text-red-900 ring-1 ring-red-100 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold"><BellRing size={17} aria-hidden />Promoções encerradas</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{encerradas.length}</p>
          <p className="text-sm opacity-80">{encerradasSemana.length} nos últimos 7 dias</p>
        </Link>
        <Link href={link({ status: 'ativa' })} className="rounded-xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-100 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold"><CircleCheck size={17} aria-hidden />Ativas</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{ativas.length}</p>
          <p className="text-sm opacity-80">em promoção na última verificação</p>
        </Link>
        <div className="rounded-xl bg-sky-50 p-4 text-sky-900 ring-1 ring-sky-100">
          <p className="flex items-center gap-2 font-semibold"><Clock size={17} aria-hidden />Como funciona</p>
          <p className="mt-1 text-sm">A tarefa diária consulta a API do Mercado Livre às 8h e compara com o dia anterior. Quando um item sai de promoção, vira alerta.</p>
        </div>
      </section>

      <section className="card overflow-hidden">
        <nav className="flex gap-1 overflow-x-auto border-b border-linha px-3" aria-label="Filtrar por status">
          {ABAS.map(a => (
            <Link key={a.rotulo} href={link({ status: a.chave })} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${status === a.chave ? 'border-rdb-700 font-semibold text-rdb-800' : 'border-transparent text-tinta-fraca hover:text-tinta'}`}>
              {a.rotulo} ({doPeriodo.filter(p => !a.chave || p.status === a.chave).length})
            </Link>
          ))}
        </nav>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-rdb-50/60"><tr>
              <th className="th w-10"><span className="sr-only">Canal</span></th><th className="th">Produto</th><th className="th text-right">Preço promocional</th>
              <th className="th text-right">Desconto</th><th className="th">Início</th><th className="th">Encerrada em</th><th className="th text-right">Dias ativa</th>
              <th className="th">Status</th><th className="th">Ads agora</th>
            </tr></thead>
            <tbody>
              {lista.map(p => {
                const a = estadoDe(p.itemId)
                return (
                  <tr key={p.itemId + p.desde} className={`border-t border-linha ${p.status === 'encerrada' ? 'bg-red-50/40' : ''}`}>
                    <td className="td"><SeloCanal canal={p.canal} /></td>
                    <td className="td max-w-[260px]"><p className="truncate font-medium">{p.titulo}</p><p className="text-xs text-tinta-fraca">{p.sku ? `SKU ${p.sku} · ` : ''}{p.itemId}</p></td>
                    <td className="td num">{reais(p.preco)}{p.precoOriginal && <span className="block text-[11px] text-tinta-fraca line-through">{reais(p.precoOriginal)}</span>}</td>
                    <td className="td num font-medium text-emerald-700">{pct(p.desconto, 0)}</td>
                    <td className="td">{dataLonga(p.desde)}</td>
                    <td className={`td ${p.encerradaEm ? 'font-medium text-red-700' : 'text-tinta-fraca'}`}>{p.encerradaEm ? (p.encerradaEm === f.ate ? 'Hoje' : dataLonga(p.encerradaEm)) : '—'}</td>
                    <td className="td num">{p.diasAtiva ?? '—'}</td>
                    <td className="td"><SeloStatus status={p.status} /></td>
                    <td className="td">{a ? <Link href={`/produtos/${encodeURIComponent(a.codigoAnuncio)}${queryFiltros(f)}`}><SeloEstado estado={a.diagnostico.estado} /></Link> : <span className="text-xs text-tinta-fraca">sem ads</span>}</td>
                  </tr>
                )
              })}
              {lista.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-sm text-tinta-fraca">Nenhuma promoção no período.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-1.5 border-t border-linha px-4 py-2 text-xs text-tinta-fraca"><TrendingDown size={13} aria-hidden />Quando uma promoção termina, confira o estado dos ads do produto: sem o desconto, a conversão costuma cair.</p>
      </section>
    </>
  )
}
