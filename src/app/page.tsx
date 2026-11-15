'use client'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, TrendingDown, TrendingUp, AlertTriangle, PackageX, Calculator, ShoppingCart, ArrowRight, Star, Tag } from 'lucide-react'
import PerguntaRapida from '@/components/ui/PerguntaRapida'
import Rentabilidade from '@/components/ui/Rentabilidade'
import { Spinner, Loading, Empty } from '@/components/ui'
import Sparkline from '@/components/charts/Sparkline'
import BarraStatus from '@/components/charts/BarraStatus'
import AreaMensal from '@/components/charts/AreaMensal'
import BarrasFornecedor from '@/components/charts/BarrasFornecedor'
import type { PontoMensal, DistribuicaoMargem, ItemCurva } from '@/lib/agregacoes'
import Link from 'next/link'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'
const pct = (v?: number | null) => v != null ? `${v.toFixed(1)}%` : '—'
const fmtData = (v?: string | null) => v ? new Date(v).toLocaleDateString('pt-BR') : '—'

interface DashData {
  mes: string
  fornecedorFiltro: string | null
  gastoTotal: number
  totalCompras: number
  fornecedores: { fornecedor: string; total: number; variacaoPct: number | null }[]
  produtosPraAjustar: { sku: string; skuVariacao: string | null; nome: string; direcao: string; fonte: string; desvioPct: number | null; variacaoPct: number | null; dataCompra: string | null }[]
  porCategoria: { categoria: string; margemMedia: number; n: number }[]
  produtosParados: { skuPrincipal: string; nome: string; dataUltimaCompra: string | null }[]
  serieMensal: PontoMensal[]
  distribuicaoMargens: DistribuicaoMargem
  curvaA: ItemCurva[]
}

interface ItemGiro {
  sku: string; nome: string; unidade: string; saldo: number; venda30d: number; cobertura: number | null
  sugestao: number; fornecedor: string; melhorPreco: string | null; valorSugerido: number; valorParado: number
}
interface ResumoGiro {
  fotoEstoque: string | null; coberturaDias: number; semCadastro: number
  urgentes: { n: number; valor: number }; comprar: { n: number; valor: number }; parados: { n: number; valor: number }
  topUrgentes: ItemGiro[]; topParados: ItemGiro[]
  pedidoPorFornecedor: { fornecedor: string; itens: number; urgentes: number; valor: number }[]
}
const real0 = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
const qtd1 = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v)
const duracao = (d: number | null) => d == null ? 'sem venda' : d > 365 ? '+1 ano' : Math.floor(d) === 1 ? '1 dia' : `${Math.floor(d)} dias`

export default function DashboardPage() {
  const [giro, setGiro] = useState<ResumoGiro | null>(null)
  const [giroErro, setGiroErro] = useState<string | null>(null)
  const [giroLoading, setGiroLoading] = useState(true)

  const loadGiro = useCallback(async () => {
    setGiroLoading(true); setGiroErro(null)
    try {
      const r = await fetch('/api/compras/sugestao?resumo=1')
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setGiro(null); setGiroErro(d.error ?? 'Não foi possível carregar o giro de estoque.'); return }
      setGiro(d)
    } catch { setGiro(null); setGiroErro('Falha de conexão ao carregar o giro de estoque.') }
    finally { setGiroLoading(false) }
  }, [])
  useEffect(() => { loadGiro() }, [loadGiro])

  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lotesVencendo, setLotesVencendo] = useState<number | null>(null)
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [fornecedor, setFornecedor] = useState('')
  const [fornecedorDebounced, setFornecedorDebounced] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setFornecedorDebounced(fornecedor), 400)
    return () => clearTimeout(t)
  }, [fornecedor])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ mes })
      if (fornecedorDebounced) params.set('fornecedor', fornecedorDebounced)
      const [r, rLotes] = await Promise.all([
        fetch('/api/dashboard?' + params),
        fetch('/api/lotes?vencendo=1'),
      ])
      if (!r.ok || !rLotes.ok) throw new Error('Falha ao carregar dashboard')
      setData(await r.json())
      const lotes = await rLotes.json()
      setLotesVencendo(Array.isArray(lotes) ? lotes.length : 0)
    } catch {
      setError('Não foi possível carregar os dados do dashboard. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [mes, fornecedorDebounced])
  useEffect(() => { load() }, [load])

  const custosQueSubiram = data?.produtosPraAjustar.filter(p => p.direcao === 'subir').length ?? 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Painel de decisão</h1>
          <p className="text-sm text-tinta-fraca mt-0.5">O que comprar, de quem, e onde o dinheiro está parado</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="inp-sm w-auto" value={mes} onChange={e => setMes(e.target.value)} />
          <input className="inp-sm w-40" placeholder="Filtrar fornecedor…" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
          <button onClick={() => { load(); loadGiro() }} className="btn-ghost gap-1.5" disabled={loading}>
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />} Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-perigo/5 border border-perigo/30 rounded-xl p-3 text-sm text-perigo">
          {error}
        </div>
      )}

      <PerguntaRapida />

      {/* ── Decisões de hoje ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CardAlerta
          n={giro?.urgentes.n ?? 0}
          titulo="acabam antes da entrega"
          sub={giro ? `${real0(giro.urgentes.valor)} para repor` : giroLoading ? 'calculando…' : 'sem dados de estoque'}
          href="/compras?aba=sugestao"
          tom={giro?.urgentes.n ? 'perigo' : 'neutro'}
          icone={AlertTriangle}
        />
        <CardAlerta
          n={giro?.comprar.n ?? 0}
          titulo="para comprar nesta rodada"
          sub={giro ? `${real0(giro.comprar.valor)} para ${giro.coberturaDias} dias de estoque` : giroLoading ? 'calculando…' : 'sem dados de estoque'}
          href="/compras?aba=sugestao"
          tom={giro?.comprar.n ? 'atencao' : 'neutro'}
          icone={ShoppingCart}
        />
        <CardAlerta
          n={giro?.parados.n ?? 0}
          titulo="produtos com estoque parado"
          sub={giro ? `${real0(giro.parados.valor)} presos há mais de 120 dias` : giroLoading ? 'calculando…' : 'sem dados de estoque'}
          href="#parados"
          tom={giro?.parados.n ? 'atencao' : 'neutro'}
          icone={PackageX}
        />
        <CardAlerta
          n={data?.produtosPraAjustar.length ?? 0}
          titulo="preços pra ajustar"
          sub={custosQueSubiram ? `${custosQueSubiram} com custo que subiu` : 'custo mudou ou preço desatualizado'}
          href="#ajustar"
          tom={data?.produtosPraAjustar.length ? 'atencao' : 'neutro'}
          icone={TrendingUp}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/lotes" className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${lotesVencendo ? 'border-atencao/40 bg-atencao/5 text-atencao' : 'border-rdb-100 text-tinta-fraca'}`}>
          <Tag size={11} /> {lotesVencendo === 1 ? '1 lote vencido ou vencendo' : `${lotesVencendo ?? 0} lotes vencidos ou vencendo`} em 30 dias
        </Link>
        <a href="#margens" className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${data?.distribuicaoMargens.prejuizo ? 'border-perigo/40 bg-perigo/5 text-perigo' : 'border-rdb-100 text-tinta-fraca'}`}>
          <TrendingDown size={11} /> {data?.distribuicaoMargens.prejuizo ?? 0} canais com margem abaixo de 20%
        </a>
        {giro?.fotoEstoque && (
          <span className="inline-flex items-center rounded-full border border-rdb-100 px-3 py-1 text-tinta-fraca">
            Estoque do Bling em {new Date(giro.fotoEstoque + 'T12:00:00').toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>

      {giroErro && (
        <div className="bg-atencao/5 border border-atencao/30 rounded-xl p-3 text-sm text-atencao">{giroErro}</div>
      )}

      {/* ── Compre primeiro + pedido por fornecedor ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="card xl:col-span-3">
          <div className="px-4 py-3 border-b border-rdb-100 flex items-center justify-between">
            <div>
              <h2 className="section-title">Compre primeiro</h2>
              <p className="text-xs text-tinta-fraca mt-0.5">Os que acabam antes de uma nova entrega chegar, pelo valor a repor</p>
            </div>
            <Link href="/compras?aba=sugestao" className="text-xs font-medium text-rdb-700 hover:text-rdb-800 inline-flex items-center gap-1 whitespace-nowrap">
              Ver todos e montar pedido <ArrowRight size={12} />
            </Link>
          </div>
          <div className="overflow-auto">
            <table className="w-full">
              <thead className="tbl-head"><tr>
                <th className="th">Produto</th><th className="th-r">Estoque</th><th className="th-r">Dura</th>
                <th className="th-r">Comprar</th><th className="th">Fornecedor</th><th className="th-r">Custo</th>
              </tr></thead>
              <tbody>
                {giroLoading && <Loading />}
                {!giroLoading && !giro?.topUrgentes.length && <Empty msg={giroErro ? 'Sem dados de estoque' : 'Nada acabando antes da entrega'} />}
                {giro?.topUrgentes.map(i => (
                  <tr key={i.sku} className="tr-row">
                    <td className="td">
                      <Link href={`/busca?q=${encodeURIComponent(i.sku)}`} className="font-medium text-tinta hover:text-rdb-700 block max-w-[190px] truncate" title={i.nome}>{i.nome}</Link>
                      <div className="text-[10px] text-tinta-fraca font-mono">{i.sku}</div>
                    </td>
                    <td className="td-r text-xs">{qtd1(i.saldo)} {i.unidade}</td>
                    <td className="td-r text-xs font-bold text-perigo">{duracao(i.cobertura)}</td>
                    <td className="td-r font-semibold">{qtd1(i.sugestao)} <span className="text-xs font-normal text-tinta-fraca">{i.unidade}</span></td>
                    <td className="td text-xs">
                      <span className="block max-w-[120px] truncate" title={i.fornecedor}>{i.fornecedor || '—'}</span>
                      {i.melhorPreco && i.melhorPreco !== i.fornecedor && (
                        <div className="text-[10px] text-ok flex items-center gap-0.5"><Star size={9} /> {i.melhorPreco} mais barato</div>
                      )}
                    </td>
                    <td className="td-r text-xs">{real0(i.valorSugerido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card xl:col-span-2">
          <div className="px-4 py-3 border-b border-rdb-100">
            <h2 className="section-title">Pedido por fornecedor</h2>
            <p className="text-xs text-tinta-fraca mt-0.5">Quanto sai para cada um se você comprar tudo o que está sugerido</p>
          </div>
          <div className="p-4 space-y-2.5 max-h-[420px] overflow-auto">
            {giroLoading && <div className="py-8 text-center"><Spinner size={16} className="mx-auto" /></div>}
            {!giroLoading && !giro?.pedidoPorFornecedor.length && <p className="text-sm text-tinta-fraca py-6 text-center">Nenhuma compra sugerida</p>}
            {giro && (() => {
              const max = Math.max(...giro.pedidoPorFornecedor.map(p => p.valor), 1)
              return giro.pedidoPorFornecedor.slice(0, 12).map(p => (
                <div key={p.fornecedor}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-tinta truncate">{p.fornecedor}</span>
                    <span className="tabular-nums font-semibold text-tinta whitespace-nowrap">{real0(p.valor)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-rdb-50 rounded-full"><div className="h-1.5 rounded-full bg-rdb-600" style={{ width: `${(p.valor / max) * 100}%` }} /></div>
                    <span className="text-[10px] text-tinta-fraca whitespace-nowrap w-32 text-right">
                      {p.itens} {p.itens === 1 ? 'item' : 'itens'}{p.urgentes > 0 && <span className="text-perigo"> · {p.urgentes} {p.urgentes === 1 ? 'urgente' : 'urgentes'}</span>}
                    </span>
                  </div>
                </div>
              ))
            })()}
          </div>
          {giro && giro.pedidoPorFornecedor.length > 0 && (
            <div className="px-4 py-2.5 border-t border-rdb-100 text-xs text-tinta-fraca flex justify-between">
              <span>Total sugerido</span>
              <strong className="text-tinta">{real0(giro.urgentes.valor + giro.comprar.valor)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* ── Rentabilidade de loja e site ── */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-tinta font-titulo">Rentabilidade do mês — loja física e site</h2>
            <p className="text-xs text-tinta-fraca mt-0.5">Vendas do Bling com o custo do Precify; use o seletor de mês no topo</p>
          </div>
          <Link href="/painel-marketplaces" className="text-xs font-medium text-rdb-700 hover:text-rdb-800 inline-flex items-center gap-1">
            Ver painel de marketplaces <ArrowRight size={12} />
          </Link>
        </div>
        <Rentabilidade mes={mes} escopo="proprio" />
      </div>

      {/* ── Produtos pra ajustar + fornecedores ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card" id="ajustar">
          <div className="px-4 py-3 border-b border-rdb-100">
            <h2 className="section-title flex items-center gap-2">
              <AlertTriangle size={14} className="text-atencao" /> Produtos pra ajustar preço
            </h2>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full">
              <thead className="tbl-head sticky top-0">
                <tr>
                  <th className="th">Produto</th>
                  <th className="th text-center">Ação</th>
                  <th className="th-r">Desvio</th>
                  <th className="th">Origem</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {loading && <Loading />}
                {!loading && !data?.produtosPraAjustar.length && <Empty msg="Nenhum produto sinalizado 🎉" />}
                {data?.produtosPraAjustar.map((p, i) => (
                  <tr key={p.skuVariacao ?? `${p.sku}-${i}`} className="tr-row">
                    <td className="td">
                      <div className="font-medium text-tinta text-xs truncate max-w-[150px]">{p.nome}</div>
                      <div className="text-[10px] text-tinta-fraca font-mono">{p.sku}</div>
                    </td>
                    <td className="td text-center">
                      {p.direcao === 'subir'
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-perigo"><TrendingUp size={12} /> subir</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok"><TrendingDown size={12} /> baixar</span>}
                    </td>
                    <td className="td-r text-xs font-semibold">
                      {p.fonte === 'preco_praticado' ? pct(p.desvioPct) : pct(p.variacaoPct != null ? Math.abs(p.variacaoPct) : null)}
                    </td>
                    <td className="td text-xs text-tinta-fraca">
                      {p.fonte === 'preco_praticado' ? 'preço desatualizado' : fmtData(p.dataCompra)}
                    </td>
                    <td className="td">
                      <Link
                        href={p.skuVariacao
                          ? `/precificacao-multicanal?skuVariacao=${encodeURIComponent(p.skuVariacao)}`
                          : `/busca?q=${encodeURIComponent(p.sku)}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-rdb-700 hover:text-rdb-800 whitespace-nowrap"
                      >
                        <Calculator size={11} /> calcular
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="section-title">Fornecedores do mês</h2>
            <span className="text-xs text-tinta-fraca">vs. mês anterior</span>
          </div>
          {loading || !data
            ? <div className="py-8 text-center"><Spinner size={16} className="mx-auto" /></div>
            : <BarrasFornecedor itens={data.fornecedores} />}
        </div>
      </div>

      {/* ── Saúde das margens + gasto no tempo ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card p-4" id="margens">
          <h2 className="section-title mb-3">Saúde das margens</h2>
          {loading || !data
            ? <div className="py-8 text-center"><Spinner size={16} className="mx-auto" /></div>
            : <BarraStatus dist={data.distribuicaoMargens} />}
        </div>
        <div className="card p-4">
          <h2 className="section-title mb-1">Quanto você comprou</h2>
          <p className="text-xs text-tinta-fraca mb-3">Gasto com compras, mês a mês</p>
          {loading || !data
            ? <div className="py-8 text-center"><Spinner size={16} className="mx-auto" /></div>
            : <AreaMensal serie={data.serieMensal} />}
        </div>
      </div>

      {/* ── Curva A ── */}
      <div className="card" id="curvaA">
        <div className="px-4 py-3 border-b border-rdb-100">
          <h2 className="section-title">Seus produtos que mais pesam</h2>
          <p className="text-xs text-tinta-fraca mt-0.5">Curva A dos últimos 6 meses — concentram 80% do que você gasta</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[720px]">
            <thead className="tbl-head sticky top-0">
              <tr>
                <th className="th">Produto</th>
                <th className="th-r">Custo atual</th>
                <th className="th">Evolução</th>
                <th className="th-r">Gasto no período</th>
                <th className="th">Mais barato hoje</th>
              </tr>
            </thead>
            <tbody>
              {loading && <Loading />}
              {!loading && !data?.curvaA.length && <Empty msg="Sem compras suficientes no período" />}
              {data?.curvaA.map(i => {
                const podeTrocar = i.melhorFornecedor && i.melhorFornecedor.nome !== i.fornecedorPrincipal
                return (
                  <tr key={i.sku} className="tr-row">
                    <td className="td">
                      <Link href={`/busca?q=${encodeURIComponent(i.sku)}`} className="font-medium text-tinta hover:text-rdb-700">
                        {i.produto}
                      </Link>
                      <div className="text-[10px] text-tinta-fraca font-mono">{i.sku} · {i.qtdCompras} compras</div>
                    </td>
                    <td className="td-r font-semibold">{brl(i.custoAtual)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <Sparkline valores={i.historicoCusto} />
                        <VariacaoCusto historico={i.historicoCusto} />
                      </div>
                    </td>
                    <td className="td-r">
                      {brl(i.totalGasto)} <span className="text-tinta-fraca text-xs">({i.pctTotal}%)</span>
                    </td>
                    <td className="td text-xs">
                      {i.melhorFornecedor ? (
                        <>
                          <span className="text-tinta">{i.melhorFornecedor.nome}</span>
                          <span className="text-tinta-fraca ml-1">{brl(i.melhorFornecedor.custoUnitario)}</span>
                          {podeTrocar && (
                            <span className="badge-amber ml-1.5" title={`Você compra mais de ${i.fornecedorPrincipal}`}>
                              trocar?
                            </span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Dinheiro parado ── */}
      <div className="card" id="parados">
        <div className="px-4 py-3 border-b border-rdb-100">
          <h2 className="section-title flex items-center gap-2"><PackageX size={13} className="text-tinta-fraca" /> Dinheiro parado em estoque</h2>
          <p className="text-xs text-tinta-fraca mt-0.5">Estoque para mais de 120 dias ou sem venda: segure a compra, faça promoção ou confira o saldo no Bling</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full">
            <thead className="tbl-head"><tr>
              <th className="th">Produto</th><th className="th-r">Estoque</th><th className="th-r">Vende em 30 dias</th>
              <th className="th-r">Dura</th><th className="th-r">Valor parado</th><th className="th">Último fornecedor</th>
            </tr></thead>
            <tbody>
              {giroLoading && <Loading />}
              {!giroLoading && !giro?.topParados.length && <Empty msg={giroErro ? 'Sem dados de estoque' : 'Nenhum estoque parado'} />}
              {giro?.topParados.map(i => (
                <tr key={i.sku} className="tr-row">
                  <td className="td">
                    <Link href={`/busca?q=${encodeURIComponent(i.sku)}`} className="font-medium text-tinta hover:text-rdb-700">{i.nome}</Link>
                    <div className="text-[10px] text-tinta-fraca font-mono">{i.sku}</div>
                  </td>
                  <td className="td-r text-xs">{qtd1(i.saldo)} {i.unidade}</td>
                  <td className="td-r text-xs">{qtd1(i.venda30d)} {i.unidade}</td>
                  <td className="td-r text-xs font-semibold">{duracao(i.cobertura)}</td>
                  <td className="td-r font-semibold">{real0(i.valorParado)}</td>
                  <td className="td text-xs text-tinta-fraca">{i.fornecedor || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** Variação entre a primeira e a última compra do histórico, em número. */
function VariacaoCusto({ historico }: { historico: number[] }) {
  if (historico.length < 2) return null
  const [primeiro] = historico
  const ultimo = historico[historico.length - 1]
  if (!primeiro) return null
  const variacao = ((ultimo - primeiro) / primeiro) * 100
  if (Math.abs(variacao) < 0.5) return <span className="text-xs text-tinta-fraca">estável</span>
  return (
    <span className="text-xs font-semibold tabular-nums" style={{ color: variacao > 0 ? '#A21309' : '#2E9E4F' }}>
      {variacao > 0 ? '↑' : '↓'} {Math.abs(variacao).toFixed(0)}%
    </span>
  )
}

function CardAlerta({ n, titulo, sub, href, tom, icone: Icon }: {
  n: number; titulo: string; sub: string; href: string
  tom: 'neutro' | 'atencao' | 'perigo'; icone: React.ElementType
}) {
  const tons = {
    neutro:  { fundo: 'bg-white',     borda: 'border-rdb-200',    num: 'text-tinta',   ic: 'bg-rdb-50 text-rdb-700' },
    atencao: { fundo: 'bg-atencao/5', borda: 'border-atencao/40', num: 'text-atencao', ic: 'bg-atencao/10 text-atencao' },
    perigo:  { fundo: 'bg-perigo/5',  borda: 'border-perigo/40',  num: 'text-perigo',  ic: 'bg-perigo/10 text-perigo' },
  }[tom]

  return (
    <Link href={href} className={`rounded-xl border p-4 shadow-rdb transition-all hover:shadow-md ${tons.fundo} ${tons.borda}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`stat-value ${tons.num}`}>{n}</p>
          <p className="text-xs font-medium text-tinta mt-0.5">{titulo}</p>
          <p className="text-[11px] text-tinta-fraca mt-0.5">{sub}</p>
        </div>
        <div className={`p-2 rounded-lg shrink-0 ${tons.ic}`}><Icon size={16} /></div>
      </div>
    </Link>
  )
}
