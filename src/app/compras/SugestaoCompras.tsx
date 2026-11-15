'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { AlertTriangle, ShoppingCart, PackageX, RefreshCw, Search, Plus, TrendingUp, TrendingDown, Star } from 'lucide-react'
import { Spinner, Alert } from '@/components/ui'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const qtd = (v: number, casas = 1) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(v)
const dt = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

interface FornSug { nome: string; preco: number; data: string; qtd: number; nomeNoFornecedor: string | null; codigo: string | null }
interface ItemSug {
  sku: string; nome: string; categoria: string; unidade: string
  saldo: number; semSaldoNoBling: boolean
  venda30d: number; venda90d: number; vendaDia: number; tendencia: number | null
  cobertura: number | null; prazoDias: number
  status: 'urgente' | 'comprar' | 'ok' | 'parado'; corrigidoRuptura: boolean
  sugestao: number; semanas: number[]
  fornecedores: FornSug[]; fornecedorPadrao: string; melhorPreco: string | null
  custoRef: number | null; valorParado: number
}
interface Dados { fotoEstoque: string | null; coberturaDias: number; semCadastro: number; itens: ItemSug[] }

export interface ItemParaPedido {
  skuPrincipal: string; nomeProduto: string; nomeNoFornecedor?: string; codigoFornecedor?: string
  quantidade: number; unidade: string; precoUnitario?: number; fornecedor: string
}

type Visao = 'urgente' | 'comprar' | 'parado' | 'todos'

function Barras({ semanas }: { semanas: number[] }) {
  const max = Math.max(...semanas, 0.0001)
  return (
    <div className="flex items-end gap-px h-6 w-20" title="Vendas das últimas 13 semanas (a mais recente à direita)">
      {semanas.map((v, i) => (
        <div key={i} className={`flex-1 rounded-[1px] ${i >= semanas.length - 4 ? 'bg-rdb-600' : 'bg-rdb-200'}`}
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />
      ))}
    </div>
  )
}

export default function SugestaoCompras({ onAdicionar }: { onAdicionar: (itens: ItemParaPedido[]) => void }) {
  const [dados, setDados]       = useState<Dados | null>(null)
  const [loading, setLoading]   = useState(true)
  const [erro, setErro]         = useState('')
  const [cobertura, setCobertura] = useState('30')
  const [visao, setVisao]       = useState<Visao>('urgente')
  const [busca, setBusca]       = useState('')
  const [fornFiltro, setFornFiltro] = useState('')
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [qtdEdit, setQtdEdit]   = useState<Record<string, string>>({})
  const [fornEdit, setFornEdit] = useState<Record<string, string>>({})

  const carregar = useCallback(async (atualizar = false) => {
    setLoading(true); setErro('')
    try {
      const r = await fetch(`/api/compras/sugestao?cobertura=${cobertura}${atualizar ? '&atualizar=1' : ''}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(d.error ?? `Erro ao carregar (HTTP ${r.status})`); setDados(null); return }
      setDados(d)
    } catch {
      setErro('Falha de conexão ao carregar as sugestões.')
    } finally { setLoading(false) }
  }, [cobertura])
  useEffect(() => { carregar() }, [carregar])

  const itens = dados?.itens ?? []
  const fornDe = (i: ItemSug) => fornEdit[i.sku] ?? i.fornecedorPadrao
  const precoDe = (i: ItemSug) => i.fornecedores.find(f => f.nome === fornDe(i))?.preco ?? i.custoRef
  const qtdDe = (i: ItemSug) => { const v = qtdEdit[i.sku]; return v != null ? (parseFloat(v.replace(',', '.')) || 0) : i.sugestao }

  const resumo = useMemo(() => {
    const urg = itens.filter(i => i.status === 'urgente'), com = itens.filter(i => i.status === 'comprar'), par = itens.filter(i => i.status === 'parado')
    const valor = (l: ItemSug[]) => l.reduce((s, i) => s + i.sugestao * (i.custoRef ?? 0), 0)
    return { urg: urg.length, valorUrg: valor(urg), com: com.length, valorCom: valor(com), par: par.length, valorPar: par.reduce((s, i) => s + i.valorParado, 0) }
  }, [itens])

  const fornecedores = useMemo(() => [...new Set(itens.map(i => i.fornecedorPadrao).filter(Boolean))].sort(), [itens])

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return itens
      .filter(i => visao === 'todos' || i.status === visao)
      .filter(i => !fornFiltro || (fornEdit[i.sku] ?? i.fornecedorPadrao) === fornFiltro)
      .filter(i => !b || i.sku.toLowerCase().includes(b) || i.nome.toLowerCase().includes(b))
      // urgente/comprar: primeiro o que mais pesa no caixa e na venda; parado: mais dinheiro preso
      .sort((a, b2) => visao === 'parado' ? b2.valorParado - a.valorParado
        : visao === 'todos' ? (a.cobertura ?? 9999) - (b2.cobertura ?? 9999)
        : b2.sugestao * (b2.custoRef ?? 0) - a.sugestao * (a.custoRef ?? 0))
  }, [itens, visao, busca, fornFiltro, fornEdit])

  const selecionados = itens.filter(i => marcados[i.sku] && qtdDe(i) > 0)
  const totalSel = selecionados.reduce((s, i) => s + qtdDe(i) * (precoDe(i) ?? 0), 0)
  const todosMarcados = visiveis.length > 0 && visiveis.every(i => marcados[i.sku])

  const adicionar = () => {
    const semForn = selecionados.filter(i => !fornDe(i))
    if (semForn.length) { alert(`Escolha o fornecedor de: ${semForn.map(i => i.nome).join(', ')}`); return }
    onAdicionar(selecionados.map(i => {
      const f = i.fornecedores.find(x => x.nome === fornDe(i))
      return {
        skuPrincipal: i.sku, nomeProduto: i.nome, nomeNoFornecedor: f?.nomeNoFornecedor ?? undefined,
        codigoFornecedor: f?.codigo ?? undefined, quantidade: qtdDe(i), unidade: i.unidade,
        precoUnitario: precoDe(i) ?? undefined, fornecedor: fornDe(i),
      }
    }))
    setMarcados({})
  }

  const cards: { id: Visao; titulo: string; valor: string; sub: string; icon: React.ElementType; cor: string; ativo: string }[] = [
    { id: 'urgente', titulo: 'Acabam antes da entrega', valor: String(resumo.urg), sub: `${brl(resumo.valorUrg)} para repor`, icon: AlertTriangle, cor: 'text-red-600', ativo: 'border-red-400 bg-red-50' },
    { id: 'comprar', titulo: 'Comprar nesta rodada', valor: String(resumo.com), sub: `${brl(resumo.valorCom)} para repor`, icon: ShoppingCart, cor: 'text-amber-600', ativo: 'border-amber-400 bg-amber-50' },
    { id: 'parado', titulo: 'Estoque parado (+120 dias)', valor: String(resumo.par), sub: `${brl(resumo.valorPar)} parados`, icon: PackageX, cor: 'text-blue-600', ativo: 'border-blue-400 bg-blue-50' },
  ]

  return (
    <div className="space-y-4 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map(c => (
          <button key={c.id} onClick={() => setVisao(c.id)}
            className={`text-left rounded-xl border-2 p-4 transition-all ${visao === c.id ? c.ativo : 'border-gray-100 bg-white hover:border-gray-200'}`}>
            <div className="flex items-center gap-1.5 text-xs text-gray-600"><c.icon size={14} className={c.cor} /> {c.titulo}</div>
            <div className={`text-2xl font-bold mt-1 ${c.cor}`}>{loading ? '…' : c.valor} <span className="text-xs font-normal text-gray-500">produtos</span></div>
            <div className="text-xs text-gray-500 mt-0.5">{loading ? ' ' : c.sub}</div>
          </button>
        ))}
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-48 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar SKU ou produto…" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="inp-sm w-auto" value={fornFiltro} onChange={e => setFornFiltro(e.target.value)}>
          <option value="">Todos fornecedores</option>
          {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="text-xs text-gray-500 flex items-center gap-1.5">
          Comprar para
          <select className="inp-sm w-auto" value={cobertura} onChange={e => setCobertura(e.target.value)}>
            {['15', '21', '30', '45', '60'].map(d => <option key={d} value={d}>{d} dias</option>)}
          </select>
        </label>
        <button onClick={() => setVisao('todos')} className={`text-xs px-2 py-1 rounded-lg ${visao === 'todos' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Ver todos</button>
        <button onClick={() => carregar(true)} className="btn-ghost text-xs" disabled={loading}>
          {loading ? <Spinner size={13} /> : <RefreshCw size={13} />} Atualizar
        </button>
      </div>

      {erro && <Alert type="error">{erro}</Alert>}
      {dados && (
        <p className="text-xs text-gray-500">
          Estoque do Bling fotografado em {dados.fotoEstoque ? new Date(dados.fotoEstoque + 'T12:00:00').toLocaleDateString('pt-BR') : '—'} · vendas das últimas 13 semanas em todos os canais
          {dados.semCadastro > 0 && <> · <span className="text-amber-700">{dados.semCadastro} produtos vendidos não têm cadastro no Precify e ficaram de fora</span></>}
        </p>
      )}

      <div className="card-tight overflow-auto">
        <table className="w-full">
          <thead className="tbl-head"><tr>
            {visao !== 'parado' && (
              <th className="th w-8">
                <input type="checkbox" checked={todosMarcados}
                  onChange={e => setMarcados(p => { const n = { ...p }; visiveis.forEach(i => { n[i.sku] = e.target.checked }); return n })} />
              </th>
            )}
            <th className="th">Produto</th>
            <th className="th-r">Estoque</th>
            <th className="th-r">Vende/30d</th>
            <th className="th">13 semanas</th>
            <th className="th-r">Dura</th>
            {visao === 'parado'
              ? <><th className="th-r">Valor parado</th><th className="th">Última compra</th></>
              : <><th className="th">Fornecedor · último preço</th><th className="th-r">Comprar</th><th className="th-r">Custo</th></>}
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <tr><td colSpan={99} className="py-12 text-center text-gray-400 text-sm"><span className="inline-flex items-center gap-2"><Spinner /> Calculando giro de estoque…</span></td></tr>}
            {!loading && !visiveis.length && <tr><td colSpan={99} className="py-12 text-center text-gray-400 text-sm">{erro ? 'Sem dados.' : 'Nenhum produto nesta situação.'}</td></tr>}
            {!loading && visiveis.map(i => {
              const f = fornDe(i), preco = precoDe(i), q = qtdDe(i)
              return (
                <tr key={i.sku} className={`tr-row ${marcados[i.sku] ? 'bg-rdb-50/60' : ''}`}>
                  {visao !== 'parado' && (
                    <td className="td"><input type="checkbox" checked={!!marcados[i.sku]} onChange={e => setMarcados(p => ({ ...p, [i.sku]: e.target.checked }))} /></td>
                  )}
                  <td className="td">
                    <div className="text-sm font-medium text-gray-900 max-w-[260px] truncate" title={i.nome}>{i.nome}</div>
                    <div className="text-[11px] text-gray-400 font-mono">{i.sku}{i.prazoDias > 2 && <span className="font-sans"> · entrega em {i.prazoDias} dias</span>}</div>
                  </td>
                  <td className="td-r text-sm">
                    {i.semSaldoNoBling ? <span className="text-gray-300" title="Sem saldo cadastrado no Bling">—</span> : <>{qtd(i.saldo)} <span className="text-xs text-gray-400">{i.unidade}</span></>}
                  </td>
                  <td className="td-r text-sm">
                    {qtd(i.venda30d)} <span className="text-xs text-gray-400">{i.unidade}</span>
                    {i.tendencia != null && Math.abs(i.tendencia) >= 0.15 && (
                      <div className={`text-[10px] flex items-center justify-end gap-0.5 ${i.tendencia > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {i.tendencia > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {i.tendencia > 0 ? '+' : ''}{Math.round(i.tendencia * 100)}% no mês
                      </div>
                    )}
                    {i.corrigidoRuptura && <div className="text-[10px] text-amber-600" title="Ficou dias sem estoque; a previsão considera o que venderia se tivesse">ficou zerado</div>}
                  </td>
                  <td className="td"><Barras semanas={i.semanas} /></td>
                  <td className={`td-r text-sm font-bold ${i.status === 'urgente' ? 'text-red-600' : i.status === 'comprar' ? 'text-amber-600' : i.status === 'parado' ? 'text-blue-600' : 'text-gray-700'}`}>
                    {i.cobertura == null ? 'sem venda' : i.cobertura > 365 ? '+1 ano' : Math.floor(i.cobertura) === 1 ? '1 dia' : `${Math.floor(i.cobertura)} dias`}
                  </td>
                  {visao === 'parado' ? (
                    <>
                      <td className="td-r text-sm font-semibold">{brl(i.valorParado)}</td>
                      <td className="td text-xs text-gray-500">
                        {i.fornecedores[0] ? <>{i.fornecedores[0].nome} · {dt(i.fornecedores[0].data)} · {qtd(i.fornecedores[0].qtd)} {i.unidade}</> : '—'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="td">
                        {i.fornecedores.length > 0 ? (
                          <select className="inp-sm w-52" value={f} onChange={e => setFornEdit(p => ({ ...p, [i.sku]: e.target.value }))}>
                            {!i.fornecedores.some(x => x.nome === f) && <option value={f}>{f || 'Escolher…'}</option>}
                            {i.fornecedores.map(x => (
                              <option key={x.nome} value={x.nome}>
                                {x.nome === i.melhorPreco ? '★ ' : ''}{x.nome} — {brl(x.preco)}/{i.unidade} ({dt(x.data)})
                              </option>
                            ))}
                          </select>
                        ) : <span className="text-xs text-gray-400">{f || 'sem compra registrada'}</span>}
                        {i.melhorPreco && i.melhorPreco !== f && (
                          <div className="text-[10px] text-emerald-700 flex items-center gap-0.5 mt-0.5"><Star size={9} /> {i.melhorPreco} está mais barato</div>
                        )}
                      </td>
                      <td className="td-r">
                        <div className="flex items-center justify-end gap-1">
                          <input className="inp-sm w-16 text-right" inputMode="decimal" value={qtdEdit[i.sku] ?? String(i.sugestao)}
                            onChange={e => { setQtdEdit(p => ({ ...p, [i.sku]: e.target.value })); setMarcados(p => ({ ...p, [i.sku]: true })) }} />
                          <span className="text-xs text-gray-400">{i.unidade}</span>
                        </div>
                      </td>
                      <td className="td-r text-sm text-gray-700">{preco != null ? brl(q * preco) : '—'}</td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selecionados.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-rdb-800 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4">
          <span className="text-sm">
            <strong>{selecionados.length}</strong> {selecionados.length === 1 ? 'produto' : 'produtos'} · {new Set(selecionados.map(fornDe)).size} fornecedor(es) · <strong>{brl(totalSel)}</strong>
          </span>
          <button onClick={adicionar} className="bg-limao text-rdb-800 font-semibold text-sm rounded-lg px-3 py-1.5 flex items-center gap-1.5">
            <Plus size={14} /> Montar pedido
          </button>
        </div>
      )}
    </div>
  )
}
