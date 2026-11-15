'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, RefreshCw, Copy, Check, Download, Calculator } from 'lucide-react'
import { Spinner, Alert } from '@/components/ui'
import { CONFIG_LOJA_PADRAO, custoBase, descontoMaximo, margem, type ConfigLoja } from '@/lib/precificacaoLoja'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const pct = (v?: number | null, casas = 1) => v != null ? `${(v * 100).toFixed(casas).replace('.', ',')}%` : '—'
const qtd = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v)

interface ItemPreco {
  sku: string; nome: string; categoria: string; fracionado: boolean
  custo: number | null; preco: number | null; receita90d: number; curva: 'A' | 'B' | 'C' | 'NOVO'
}
interface ItemGiro { sku: string; saldo: number; unidade: string; cobertura: number | null; status: string; venda30d: number }

const DESCONTOS = [5, 10, 15, 20, 25, 30]
type Piso = 'minimo' | 'atencao' | 'meta'

export default function PromocoesPage() {
  const [precos, setPrecos] = useState<ItemPreco[]>([])
  const [giro, setGiro] = useState<Map<string, ItemGiro>>(new Map())
  const [config, setConfig] = useState<ConfigLoja>(CONFIG_LOJA_PADRAO)
  const [aviso, setAviso] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const [desconto, setDesconto] = useState(10)
  const [piso, setPiso] = useState<Piso>('minimo')
  const [soSobrando, setSoSobrando] = useState(false)
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const [curva, setCurva] = useState('')
  const [categoria, setCategoria] = useState('')
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(async (atualizar = false) => {
    setLoading(true); setErro('')
    try {
      const q = atualizar ? '?atualizar=1' : ''
      const [rp, rg] = await Promise.all([fetch(`/api/precificar${q}`), fetch(`/api/compras/sugestao${q}`)])
      if (!rp.ok) throw new Error()
      const dp = await rp.json()
      setPrecos(dp.itens); setConfig(dp.config); setAviso(dp.avisoFarol)
      // sem o giro a tela ainda funciona, só fica sem a coluna de estoque
      const dg = rg.ok ? await rg.json() : { itens: [] }
      setGiro(new Map((dg.itens as ItemGiro[]).map(i => [i.sku, i])))
    } catch { setErro('Não foi possível carregar os produtos. Tente de novo.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const margemPiso = config[piso]
  const d = desconto / 100

  const linhas = useMemo(() => {
    // desconto máximo que ainda preserva a margem escolhida
    const cfgPiso = { ...config, minimo: margemPiso }
    return precos.filter(p => p.custo != null && p.preco != null && p.preco > 0).map(p => {
      const g = giro.get(p.sku)
      const descMax = descontoMaximo(p.custo, p.preco, p.fracionado, cfgPiso) ?? 0
      const precoPromo = p.preco! * (1 - d)
      return {
        ...p, g, descMax, precoPromo,
        margemAtual: margem(p.preco, custoBase(p.custo!, p.fracionado, config), config),
        margemPromo: margem(precoPromo, custoBase(p.custo!, p.fracionado, config), config),
        aceita: descMax + 1e-9 >= d,
        sobrando: !!g && (g.status === 'parado' || (g.cobertura != null && g.cobertura > 60)),
      }
    })
  }, [precos, giro, config, margemPiso, d])

  const categorias = useMemo(() => [...new Set(precos.map(p => p.categoria).filter(Boolean))].sort(), [precos])

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return linhas
      .filter(l => mostrarTodos || l.aceita)
      .filter(l => !soSobrando || l.sobrando)
      .filter(l => !curva || l.curva === curva)
      .filter(l => !categoria || l.categoria === categoria)
      .filter(l => !b || l.sku.toLowerCase().includes(b) || l.nome.toLowerCase().includes(b))
      // primeiro quem tem estoque sobrando, depois quem aguenta mais desconto
      .sort((a, c) => Number(c.sobrando) - Number(a.sobrando) || c.descMax - a.descMax || c.receita90d - a.receita90d)
  }, [linhas, mostrarTodos, soSobrando, curva, categoria, busca])

  const resumo = useMemo(() => ({
    porFaixa: DESCONTOS.map(x => ({ x, n: linhas.filter(l => l.descMax + 1e-9 >= x / 100).length })),
    aceitam: linhas.filter(l => l.aceita).length,
    aceitamSobrando: linhas.filter(l => l.aceita && l.sobrando).length,
    semFolga: linhas.filter(l => l.descMax < 0.05).length,
  }), [linhas])

  const selecionados = visiveis.filter(l => marcados[l.sku])
  const paraExportar = selecionados.length ? selecionados : visiveis
  const todosMarcados = visiveis.length > 0 && visiveis.every(l => marcados[l.sku])
  const un = (l: { fracionado: boolean }) => (l.fracionado ? '/kg' : '')

  const copiar = async () => {
    const txt = `Campanha de ${desconto}% — ${new Date().toLocaleDateString('pt-BR')}\n\n` +
      paraExportar.map(l => `${l.nome} (${l.sku}): de ${brl(l.preco)}${un(l)} por ${brl(l.precoPromo)}${un(l)}`).join('\n')
    try { await navigator.clipboard.writeText(txt); setCopiado(true); setTimeout(() => setCopiado(false), 2500) }
    catch { alert('Não foi possível copiar.') }
  }
  const baixar = () => {
    const n = (v: number | null | undefined) => (v == null ? '' : v.toFixed(2).replace('.', ','))
    // texto vindo do cadastro: entre aspas, com aspas internas dobradas, e sem deixar o Excel
    // interpretar como fórmula valores que começam com = + - @ (ou tab / retorno de carro)
    const texto = (s: string | null | undefined) => {
      const v = String(s ?? '')
      return '"' + (/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"'
    }
    const cab = ['SKU', 'Produto', 'Categoria', 'Curva', 'Unidade', 'Preço atual', `Preço com ${desconto}%`, 'Desconto máximo %', 'Margem atual %', 'Margem na promoção %', 'Estoque', 'Dias de estoque']
    const rows = paraExportar.map(l => [
      texto(l.sku), texto(l.nome), texto(l.categoria), texto(l.curva), l.fracionado ? 'kg' : 'un', n(l.preco), n(l.precoPromo),
      n(l.descMax * 100), n(l.margemAtual != null ? l.margemAtual * 100 : null), n(l.margemPromo != null ? l.margemPromo * 100 : null),
      l.g ? n(l.g.saldo) : '', l.g?.cobertura != null ? String(Math.floor(l.g.cobertura)) : '',
    ].join(';'))
    const blob = new Blob(['﻿' + [cab.join(';'), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `campanha-${desconto}pct-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Promoções — loja e site</h1>
          <p className="text-sm text-tinta-fraca mt-0.5">Quais produtos aguentam desconto, e de quanto, sem furar a margem que você quer preservar</p>
        </div>
        <button onClick={() => carregar(true)} className="btn-ghost text-xs" disabled={loading}>{loading ? <Spinner size={13} /> : <RefreshCw size={13} />} Atualizar</button>
      </div>

      {erro && <Alert type="error">{erro}</Alert>}
      {aviso && <Alert type="warning">{aviso} Sem ela não há preço atual do Bling, e a lista fica vazia.</Alert>}

      <div className="card p-4 space-y-4">
        <div>
          <div className="lbl">Desconto da campanha</div>
          <div className="flex items-center gap-2 flex-wrap">
            {resumo.porFaixa.map(f => (
              <button key={f.x} onClick={() => setDesconto(f.x)}
                className={`rounded-xl border-2 px-3 py-2 text-left transition-all ${desconto === f.x ? 'border-rdb-700 bg-rdb-50' : 'border-rdb-100 bg-white hover:border-rdb-200'}`}>
                <div className="text-lg font-bold font-titulo text-tinta leading-none">{f.x}%</div>
                <div className="text-[11px] text-tinta-fraca mt-1">{loading ? '…' : `${f.n} produtos`}</div>
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-tinta-fraca ml-2">
              outro:
              <input className="inp-sm w-16 text-right" type="number" min={1} max={90} value={desconto}
                onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= 90) setDesconto(v) }} /> %
            </label>
          </div>
        </div>
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-xs text-tinta">
          <label className="flex items-center gap-1.5">
            Margem a preservar:
            <select className="inp-sm w-auto" value={piso} onChange={e => setPiso(e.target.value as Piso)}>
              <option value="minimo">mínima ({pct(config.minimo, 0)})</option>
              <option value="atencao">zona de atenção ({pct(config.atencao, 0)})</option>
              <option value="meta">meta ({pct(config.meta, 0)})</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={soSobrando} onChange={e => setSoSobrando(e.target.checked)} /> Só com estoque sobrando (parado ou mais de 60 dias)</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={mostrarTodos} onChange={e => setMostrarTodos(e.target.checked)} /> Mostrar também os que não aguentam {desconto}%</label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="stat-value text-ok">{loading ? '…' : resumo.aceitam}</div>
          <div className="text-xs font-medium text-tinta mt-0.5">aguentam {desconto}% de desconto</div>
          <div className="text-[11px] text-tinta-fraca mt-0.5">mantendo pelo menos {pct(margemPiso, 0)} de margem</div>
        </div>
        <div className="card p-4">
          <div className="stat-value text-rdb-700">{loading ? '…' : resumo.aceitamSobrando}</div>
          <div className="text-xs font-medium text-tinta mt-0.5">desses, com estoque sobrando</div>
          <div className="text-[11px] text-tinta-fraca mt-0.5">os melhores candidatos: giram o que está parado</div>
        </div>
        <div className="card p-4">
          <div className="stat-value text-perigo">{loading ? '…' : resumo.semFolga}</div>
          <div className="text-xs font-medium text-tinta mt-0.5">sem folga para promoção</div>
          <div className="text-[11px] text-tinta-fraca mt-0.5">aguentam menos de 5%: deixar fora das campanhas</div>
        </div>
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-48 bg-rdb-50 border border-rdb-100 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-tinta-fraca" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar SKU ou produto…" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="inp-sm w-auto max-w-[180px]" value={categoria} onChange={e => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="inp-sm w-auto" value={curva} onChange={e => setCurva(e.target.value)}>
          <option value="">Todas as curvas</option>
          <option value="A">Curva A</option><option value="B">Curva B</option><option value="C">Curva C</option><option value="NOVO">Sem venda</option>
        </select>
        <span className="text-xs text-tinta-fraca">{visiveis.length} produtos</span>
        <div className="flex gap-2 ml-auto">
          <button onClick={copiar} className="btn-ghost text-xs" disabled={!paraExportar.length}>
            {copiado ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar {selecionados.length ? `${selecionados.length} marcados` : 'lista'}</>}
          </button>
          <button onClick={baixar} className="btn-ghost text-xs" disabled={!paraExportar.length}><Download size={12} /> Planilha (CSV)</button>
        </div>
      </div>

      <div className="card-tight overflow-auto">
        <table className="w-full">
          <thead className="tbl-head"><tr>
            <th className="th w-8"><input type="checkbox" checked={todosMarcados}
              onChange={e => setMarcados(p => { const n = { ...p }; visiveis.forEach(l => { n[l.sku] = e.target.checked }); return n })} /></th>
            <th className="th">Produto</th><th className="th text-center">Curva</th><th className="th-r">Estoque</th>
            <th className="th-r">Preço atual</th><th className="th-r">Desc. máx.</th>
            <th className="th-r">Com {desconto}%</th><th className="th-r">Margem hoje</th><th className="th-r">Na promoção</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="py-12 text-center text-tinta-fraca text-sm"><span className="inline-flex items-center gap-2"><Spinner /> Calculando descontos…</span></td></tr>}
            {!loading && !visiveis.length && <tr><td colSpan={10} className="py-12 text-center text-tinta-fraca text-sm">Nenhum produto aguenta {desconto}% com esses filtros. Tente um desconto menor ou outra margem a preservar.</td></tr>}
            {!loading && visiveis.slice(0, 500).map(l => (
              <tr key={l.sku} className={`tr-row ${marcados[l.sku] ? 'bg-rdb-50/70' : ''} ${!l.aceita ? 'opacity-60' : ''}`}>
                <td className="td"><input type="checkbox" checked={!!marcados[l.sku]} onChange={e => setMarcados(p => ({ ...p, [l.sku]: e.target.checked }))} /></td>
                <td className="td">
                  <div className="font-medium text-tinta max-w-[210px] truncate" title={l.nome}>{l.nome}</div>
                  <div className="text-[10px] text-tinta-fraca font-mono">{l.sku}{l.categoria && <span className="font-sans"> · {l.categoria}</span>}</div>
                </td>
                <td className="td text-center text-xs font-semibold">{l.curva === 'NOVO' ? '—' : l.curva}</td>
                <td className="td-r text-xs">
                  {l.g ? (
                    <>
                      {qtd(l.g.saldo)} {l.g.unidade}
                      <div className={`text-[10px] ${l.sobrando ? 'text-rdb-700 font-semibold' : 'text-tinta-fraca'}`}>
                        {l.g.cobertura == null ? 'sem venda' : l.g.cobertura > 365 ? 'dura +1 ano' : `dura ${Math.floor(l.g.cobertura)} dias`}
                      </div>
                    </>
                  ) : <span className="text-tinta-fraca">—</span>}
                </td>
                <td className="td-r">{brl(l.preco)}<span className="text-[10px] text-tinta-fraca">{un(l)}</span></td>
                <td className={`td-r font-bold ${l.descMax >= 0.2 ? 'text-ok' : l.descMax >= 0.1 ? 'text-tinta' : l.descMax >= 0.05 ? 'text-atencao' : 'text-perigo'}`}>{pct(l.descMax)}</td>
                <td className="td-r font-semibold text-rdb-700">{l.aceita ? <>{brl(l.precoPromo)}<span className="text-[10px] font-normal text-tinta-fraca">{un(l)}</span></> : <span className="text-xs font-normal text-perigo">não aguenta</span>}</td>
                <td className="td-r text-xs">{pct(l.margemAtual)}</td>
                <td className={`td-r text-xs font-semibold ${l.margemPromo == null ? '' : l.margemPromo < config.minimo ? 'text-perigo' : l.margemPromo < config.atencao ? 'text-atencao' : 'text-ok'}`}>{pct(l.margemPromo)}</td>
                <td className="td">
                  <Link href={`/precificar?sku=${encodeURIComponent(l.sku)}`} className="inline-flex items-center gap-1 text-xs font-medium text-rdb-700 hover:text-rdb-800 whitespace-nowrap"><Calculator size={11} /> abrir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visiveis.length > 500 && <p className="text-xs text-tinta-fraca p-3">Mostrando os 500 primeiros de {visiveis.length}. Use os filtros para ver os demais; a planilha traz todos.</p>}
      </div>

      <p className="text-xs text-tinta-fraca">
        O desconto é aplicado sobre o preço cadastrado no Bling. A margem considera custo, embalagem, imposto e taxas de pagamento; frete grátis e cashback são avaliados por pedido e não entram aqui.
      </p>
    </div>
  )
}
