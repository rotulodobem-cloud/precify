'use client'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, TrendingDown, TrendingUp, AlertTriangle, PackageX, Calculator } from 'lucide-react'
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

export default function DashboardPage() {
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
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-tinta-fraca mt-0.5">O que precisa da sua atenção hoje, e onde está indo o dinheiro</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="inp-sm w-auto" value={mes} onChange={e => setMes(e.target.value)} />
          <input className="inp-sm w-40" placeholder="Filtrar fornecedor…" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
          <button onClick={load} className="btn-ghost gap-1.5" disabled={loading}>
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />} Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-perigo/5 border border-perigo/30 rounded-xl p-3 text-sm text-perigo">
          {error}
        </div>
      )}

      {/* ── Precisa de atenção ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CardAlerta
          n={data?.produtosPraAjustar.length ?? 0}
          titulo="preços pra ajustar"
          sub="custo mudou ou preço desatualizado"
          href="#ajustar"
          tom={data?.produtosPraAjustar.length ? 'atencao' : 'neutro'}
          icone={AlertTriangle}
        />
        <CardAlerta
          n={data?.distribuicaoMargens.prejuizo ?? 0}
          titulo="canais no prejuízo"
          sub="margem abaixo de 20%"
          href="#margens"
          tom={data?.distribuicaoMargens.prejuizo ? 'perigo' : 'neutro'}
          icone={TrendingDown}
        />
        <CardAlerta
          n={lotesVencendo ?? 0}
          titulo="lotes vencendo"
          sub="vencidos ou vencem em 30 dias"
          href="/lotes"
          tom={lotesVencendo ? 'atencao' : 'neutro'}
          icone={PackageX}
        />
        <CardAlerta
          n={custosQueSubiram}
          titulo="custos que subiram"
          sub="pedem reajuste de preço"
          href="#ajustar"
          tom={custosQueSubiram ? 'atencao' : 'neutro'}
          icone={TrendingUp}
        />
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
          <h2 className="section-title mb-1">Onde vai o dinheiro</h2>
          <p className="text-xs text-tinta-fraca mb-3">Gasto com compras, mês a mês</p>
          {loading || !data
            ? <div className="py-8 text-center"><Spinner size={16} className="mx-auto" /></div>
            : <AreaMensal serie={data.serieMensal} />}
        </div>
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

      {/* ── Produtos parados ── */}
      <div className="card p-4" id="parados">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <PackageX size={13} className="text-tinta-fraca" /> Produtos sem compra recente
        </h2>
        {!data?.produtosParados.length ? (
          <p className="text-sm text-tinta-fraca py-4 text-center">Nenhum produto parado</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-auto">
            {data.produtosParados.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-rdb-100 last:border-0">
                <div>
                  <Link href={`/busca?q=${encodeURIComponent(p.skuPrincipal)}`} className="font-medium text-tinta hover:text-rdb-700">
                    {p.nome}
                  </Link>
                  <span className="text-xs text-tinta-fraca ml-2">#{p.skuPrincipal}</span>
                </div>
                <span className="text-xs text-tinta-fraca">
                  {p.dataUltimaCompra ? `última: ${fmtData(p.dataUltimaCompra)}` : 'nunca comprado'}
                </span>
              </div>
            ))}
          </div>
        )}
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
