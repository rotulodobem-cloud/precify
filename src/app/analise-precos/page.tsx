'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, RefreshCw, Calculator } from 'lucide-react'
import { Spinner, Alert } from '@/components/ui'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const pct = (v?: number | null) => v != null ? `${(v * 100).toFixed(1).replace('.', ',')}%` : '—'

type Situacao = 'CRITICO' | 'ABAIXO_DA_META' | 'NA_META' | 'SEM_DADOS'
interface Item {
  sku: string; nome: string; fracionado: boolean; curva: 'A' | 'B' | 'C' | 'NOVO'
  custo: number | null; preco: number | null; precoMedio30d: number | null; receita90d: number
  margem: number | null; precoIdeal: number | null; ajusteParaMeta: number | null
  descontoMaximo: number | null; situacao: Situacao
}

const SIT: Record<Situacao, { rotulo: string; cor: string; ativo: string; badge: string; ordem: number }> = {
  CRITICO:        { rotulo: 'Críticos',       cor: 'text-perigo',  ativo: 'border-perigo/50 bg-perigo/5',   badge: 'badge-red',   ordem: 0 },
  ABAIXO_DA_META: { rotulo: 'Abaixo da meta', cor: 'text-atencao', ativo: 'border-atencao/50 bg-atencao/5', badge: 'badge-amber', ordem: 1 },
  NA_META:        { rotulo: 'Na meta',        cor: 'text-ok',      ativo: 'border-ok/50 bg-ok/5',           badge: 'badge-green', ordem: 2 },
  SEM_DADOS:      { rotulo: 'Sem dados',      cor: 'text-tinta-fraca', ativo: 'border-rdb-300 bg-rdb-50',   badge: 'badge-gray',  ordem: 3 },
}

function oQueFazer(i: Item, meta: number): string {
  if (i.situacao === 'SEM_DADOS') return !i.custo ? 'Cadastrar custo (lançar compra)' : 'Sem preço no Bling'
  if (i.situacao === 'CRITICO') return 'Rever preço'
  if (i.situacao === 'ABAIXO_DA_META') return `Avaliar reajuste para ${(meta * 100).toFixed(0)}%`
  return i.descontoMaximo ? `Aceita até ${pct(i.descontoMaximo)} de desconto` : 'Manter'
}

export default function AnalisePrecosPage() {
  const [itens, setItens] = useState<Item[]>([])
  const [meta, setMeta] = useState(0.3)
  const [minimo, setMinimo] = useState(0.18)
  const [aviso, setAviso] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<Situacao | 'TODOS'>('CRITICO')
  const [curva, setCurva] = useState('')
  const [busca, setBusca] = useState('')
  const [soComVenda, setSoComVenda] = useState(true)

  const carregar = useCallback(async (atualizar = false) => {
    setLoading(true); setErro('')
    try {
      const r = await fetch(`/api/precificar${atualizar ? '?atualizar=1' : ''}`)
      if (!r.ok) throw new Error()
      const d = await r.json()
      setItens(d.itens); setMeta(d.config.meta); setMinimo(d.config.minimo); setAviso(d.avisoFarol)
    } catch { setErro('Não foi possível carregar a análise. Tente de novo.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const base = useMemo(() => itens.filter(i => !soComVenda || i.receita90d > 0), [itens, soComVenda])
  const contagem = useMemo(() => {
    const c: Record<Situacao, number> = { CRITICO: 0, ABAIXO_DA_META: 0, NA_META: 0, SEM_DADOS: 0 }
    for (const i of base) c[i.situacao]++
    return c
  }, [base])

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return base
      .filter(i => filtro === 'TODOS' || i.situacao === filtro)
      .filter(i => !curva || i.curva === curva)
      .filter(i => !b || i.sku.toLowerCase().includes(b) || i.nome.toLowerCase().includes(b))
      .sort((a, c) => SIT[a.situacao].ordem - SIT[c.situacao].ordem || c.receita90d - a.receita90d)
  }, [base, filtro, curva, busca])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Análise de preços — loja e site</h1>
          <p className="text-sm text-tinta-fraca mt-0.5">O que precisa de atenção: críticos primeiro, depois abaixo da meta, pelo que mais vende</p>
        </div>
        <button onClick={() => carregar(true)} className="btn-ghost text-xs" disabled={loading}>{loading ? <Spinner size={13} /> : <RefreshCw size={13} />} Atualizar</button>
      </div>

      {erro && <Alert type="error">{erro}</Alert>}
      {aviso && <Alert type="warning">{aviso} Sem ela não há preço atual nem vendas, então quase tudo aparece como "Sem dados".</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(SIT) as Situacao[]).map(s => (
          <button key={s} onClick={() => setFiltro(f => (f === s ? 'TODOS' : s))}
            className={`text-left rounded-xl border-2 p-4 transition-all ${filtro === s ? SIT[s].ativo : 'border-rdb-100 bg-white hover:border-rdb-200'}`}>
            <div className={`stat-value ${SIT[s].cor}`}>{loading ? '…' : contagem[s]}</div>
            <div className="text-xs font-medium text-tinta mt-0.5">{SIT[s].rotulo}</div>
            <div className="text-[11px] text-tinta-fraca mt-0.5">
              {s === 'CRITICO' ? `margem abaixo de ${(minimo * 100).toFixed(0)}%` : s === 'ABAIXO_DA_META' ? `entre ${(minimo * 100).toFixed(0)}% e ${(meta * 100).toFixed(0)}%` : s === 'NA_META' ? `${(meta * 100).toFixed(0)}% ou mais` : 'sem custo ou sem preço'}
            </div>
          </button>
        ))}
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-48 bg-rdb-50 border border-rdb-100 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-tinta-fraca" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar SKU ou produto…" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="inp-sm w-auto" value={curva} onChange={e => setCurva(e.target.value)}>
          <option value="">Todas as curvas</option>
          <option value="A">Curva A</option><option value="B">Curva B</option><option value="C">Curva C</option><option value="NOVO">Sem venda</option>
        </select>
        <label className="text-xs text-tinta-fraca flex items-center gap-1.5">
          <input type="checkbox" checked={soComVenda} onChange={e => setSoComVenda(e.target.checked)} /> Só o que vendeu em 90 dias
        </label>
        <button onClick={() => setFiltro('TODOS')} className={`text-xs px-2 py-1 rounded-lg ${filtro === 'TODOS' ? 'bg-rdb-700 text-white' : 'text-tinta-fraca hover:bg-rdb-50'}`}>Ver todos</button>
        <span className="text-xs text-tinta-fraca ml-auto">{visiveis.length} produtos</span>
      </div>

      <div className="card-tight overflow-auto">
        <table className="w-full">
          <thead className="tbl-head"><tr>
            <th className="th">Situação</th><th className="th">Produto</th><th className="th text-center">Curva</th>
            <th className="th-r">Vendas 90d</th><th className="th-r">Preço no Bling</th><th className="th-r">Custo</th>
            <th className="th-r">Margem</th><th className="th-r">Preço sugerido</th><th className="th-r">Ajuste p/ meta</th>
            <th className="th-r">Desc. máx.</th><th className="th">O que fazer</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={12} className="py-12 text-center text-tinta-fraca text-sm"><span className="inline-flex items-center gap-2"><Spinner /> Calculando margens…</span></td></tr>}
            {!loading && !visiveis.length && <tr><td colSpan={12} className="py-12 text-center text-tinta-fraca text-sm">Nenhum produto nesta situação.</td></tr>}
            {!loading && visiveis.slice(0, 400).map(i => (
              <tr key={i.sku} className="tr-row">
                <td className="td"><span className={SIT[i.situacao].badge}>{SIT[i.situacao].rotulo.replace(/s$/, '')}</span></td>
                <td className="td">
                  <div className="font-medium text-tinta max-w-[240px] truncate" title={i.nome}>{i.nome}</div>
                  <div className="text-[10px] text-tinta-fraca font-mono">{i.sku} · por {i.fracionado ? 'kg' : 'un'}</div>
                </td>
                <td className="td text-center text-xs font-semibold">{i.curva === 'NOVO' ? '—' : i.curva}</td>
                <td className="td-r text-xs">{brl(i.receita90d)}</td>
                <td className="td-r">
                  {brl(i.preco)}
                  {i.preco != null && i.precoMedio30d != null && Math.abs(i.precoMedio30d - i.preco) / i.preco > 0.05 && (
                    <div className="text-[10px] text-atencao" title="Preço médio realmente vendido nas lojas e no site nos últimos 30 dias">vendido a {brl(i.precoMedio30d)}</div>
                  )}
                </td>
                <td className="td-r text-xs">{brl(i.custo)}</td>
                <td className={`td-r font-bold ${i.situacao === 'CRITICO' ? 'text-perigo' : i.situacao === 'ABAIXO_DA_META' ? 'text-atencao' : i.situacao === 'NA_META' ? 'text-ok' : 'text-tinta-fraca'}`}>{pct(i.margem)}</td>
                <td className="td-r font-semibold text-rdb-700">{brl(i.precoIdeal)}</td>
                <td className="td-r text-xs">{i.ajusteParaMeta != null && i.ajusteParaMeta > 0.005 ? `+ ${brl(i.ajusteParaMeta)}` : '—'}</td>
                <td className="td-r text-xs">{pct(i.descontoMaximo)}</td>
                <td className="td text-xs">{oQueFazer(i, meta)}</td>
                <td className="td">
                  <Link href={`/precificar?sku=${encodeURIComponent(i.sku)}`} className="inline-flex items-center gap-1 text-xs font-medium text-rdb-700 hover:text-rdb-800 whitespace-nowrap">
                    <Calculator size={11} /> abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visiveis.length > 400 && <p className="text-xs text-tinta-fraca p-3">Mostrando os 400 primeiros de {visiveis.length}. Use a busca ou os filtros para ver os demais.</p>}
      </div>
    </div>
  )
}
