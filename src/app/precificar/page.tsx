'use client'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, Settings2, RefreshCw, X } from 'lucide-react'
import { Spinner, Alert } from '@/components/ui'
import {
  analisar, gramaturas, promocoes, CAMPOS_CONFIG_LOJA, CONFIG_LOJA_PADRAO,
  type ConfigLoja, type Semaforo,
} from '@/lib/precificacaoLoja'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const pct = (v?: number | null, casas = 1) => v != null ? `${(v * 100).toFixed(casas).replace('.', ',')}%` : '—'
const num = (s: string) => { const v = parseFloat(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null }

interface Item {
  sku: string; nome: string; categoria: string; fracionado: boolean
  custo: number | null; dataUltimaCompra: string | null; fornecedor: string | null
  preco: number | null; precoAtualizadoEm: string | null; precoMedio30d: number | null
  receita90d: number; receitaMkt90d: number; curva: 'A' | 'B' | 'C' | 'NOVO'
}

const COR: Record<Semaforo, string> = {
  VERDE: 'bg-ok/10 text-ok border-ok/30', AMARELO: 'bg-atencao/10 text-atencao border-atencao/30', VERMELHO: 'bg-perigo/10 text-perigo border-perigo/30',
}
function Sinal({ s }: { s: Semaforo | null }) {
  if (!s) return <span className="text-tinta-fraca">—</span>
  return <span className={`inline-block text-[11px] font-semibold rounded-full border px-2 py-0.5 ${COR[s]}`}>{s}</span>
}

function PrecificarContent() {
  const sp = useSearchParams()
  const router = useRouter()
  const [itens, setItens] = useState<Item[]>([])
  const [config, setConfig] = useState<ConfigLoja>(CONFIG_LOJA_PADRAO)
  const [aviso, setAviso] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [sku, setSku] = useState(sp.get('sku') ?? '')
  const [precoSim, setPrecoSim] = useState('')
  const [custoSim, setCustoSim] = useState('')
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async (atualizar = false) => {
    setLoading(true); setErro('')
    try {
      const r = await fetch(`/api/precificar${atualizar ? '?atualizar=1' : ''}`)
      if (!r.ok) throw new Error()
      const d = await r.json()
      setItens(d.itens); setConfig(d.config); setAviso(d.avisoFarol)
    } catch { setErro('Não foi possível carregar o catálogo. Tente de novo.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const item = useMemo(() => itens.find(i => i.sku.toLowerCase() === sku.trim().toLowerCase()) ?? null, [itens, sku])
  const sugestoes = useMemo(() => {
    const b = busca.trim().toLowerCase()
    if (b.length < 2) return []
    return itens.filter(i => i.sku.toLowerCase().includes(b) || i.nome.toLowerCase().includes(b))
      .sort((a, c) => Number(c.sku.toLowerCase() === b) - Number(a.sku.toLowerCase() === b) || c.receita90d - a.receita90d).slice(0, 8)
  }, [itens, busca])

  const escolher = (s: string) => {
    setSku(s); setBusca(''); setPrecoSim(''); setCustoSim('')
    router.replace(`/precificar?sku=${encodeURIComponent(s)}`, { scroll: false })
  }

  const custo = num(custoSim) ?? item?.custo ?? null
  const precoTeste = num(precoSim)
  const a0 = item ? analisar({ custo, preco: item.preco, fracionado: item.fracionado }, config) : null
  // mesma ordem da planilha: simulação > preço atual > preço ideal (produto novo)
  const precoUsado = precoTeste ?? item?.preco ?? a0?.precoIdeal ?? null
  const base = precoTeste ? 'PREÇO DE TESTE' : item?.preco ? 'PREÇO ATUAL' : custo ? 'PREÇO SUGERIDO PARA NOVO' : 'CADASTRE O CUSTO'
  const a = item ? analisar({ custo, preco: precoUsado, fracionado: item.fracionado }, config) : null
  const pacotes = item?.fracionado ? gramaturas(custo, precoUsado, config) : []
  const promos = item ? promocoes({ custo, preco: precoUsado, fracionado: item.fracionado }, config) : []
  const un = item?.fracionado ? 'kg' : 'un'

  const abrirConfig = () => {
    setForm(Object.fromEntries(CAMPOS_CONFIG_LOJA.map(c => [c.chave, String(c.tipo === 'pct' ? +(config[c.chave] * 100).toFixed(4) : config[c.chave]).replace('.', ',')])))
    setEditando(true)
  }
  const salvarConfig = async () => {
    setSalvando(true); setErro('')
    const corpo = Object.fromEntries(CAMPOS_CONFIG_LOJA.map(c => {
      const v = parseFloat((form[c.chave] ?? '').replace(',', '.'))
      return [c.chave, c.tipo === 'pct' ? v / 100 : v]
    }))
    try {
      const r = await fetch('/api/precificar/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(d.error ?? 'Não foi possível salvar os parâmetros.'); return }
      setConfig(d); setEditando(false)
    } catch { setErro('Falha de conexão ao salvar os parâmetros.') }
    finally { setSalvando(false) }
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Precificar — loja e site</h1>
          <p className="text-sm text-tinta-fraca mt-0.5">Preço por kg igual em todas as gramaturas; a embalagem muda a margem de cada pacote. Marketplaces têm tela própria.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/analise-precos" className="btn-ghost text-xs">Ver análise de preços</Link>
          <button onClick={abrirConfig} className="btn-ghost text-xs"><Settings2 size={13} /> Parâmetros</button>
          <button onClick={() => carregar(true)} className="btn-ghost text-xs" disabled={loading}>{loading ? <Spinner size={13} /> : <RefreshCw size={13} />} Atualizar</button>
        </div>
      </div>

      {erro && <Alert type="error">{erro}</Alert>}
      {aviso && <Alert type="warning">{aviso} Sem ela, o preço atual e a curva ABC ficam em branco; a simulação funciona normalmente.</Alert>}

      {editando && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Parâmetros da precificação (valem para todos os produtos)</h2>
            <button onClick={() => setEditando(false)} className="text-tinta-fraca hover:text-tinta"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CAMPOS_CONFIG_LOJA.map(c => (
              <div key={c.chave}>
                <label className="lbl">{c.rotulo} ({c.tipo === 'pct' ? '%' : 'R$'})</label>
                <input className="inp" inputMode="decimal" value={form[c.chave] ?? ''} onChange={e => setForm(p => ({ ...p, [c.chave]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className="btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
            <button className="btn-primary" onClick={salvarConfig} disabled={salvando}>{salvando && <Spinner size={13} />} Salvar parâmetros</button>
          </div>
        </div>
      )}

      {/* Busca do produto */}
      <div className="card p-4 relative">
        <label className="lbl">Produto (digite o SKU-base ou parte do nome)</label>
        <div className="flex items-center gap-2 bg-white border border-rdb-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-rdb-700">
          <Search size={15} className="text-tinta-fraca" />
          <input className="flex-1 text-sm outline-none bg-transparent" autoFocus placeholder={loading ? 'Carregando catálogo…' : 'Ex.: 349 ou pimenta'}
            value={busca} onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && sugestoes[0]) escolher(sugestoes[0].sku) }} />
        </div>
        {sugestoes.length > 0 && (
          <div className="absolute left-4 right-4 top-full -mt-2 z-20 bg-white border border-rdb-200 rounded-xl shadow-xl overflow-hidden">
            {sugestoes.map(s => (
              <button key={s.sku} onClick={() => escolher(s.sku)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-rdb-50 border-b border-rdb-50 last:border-0">
                <span className="text-sm text-tinta truncate">{s.nome}</span>
                <span className="text-xs text-tinta-fraca font-mono shrink-0">{s.sku} · curva {s.curva}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!item && !loading && (
        <div className="card p-10 text-center text-sm text-tinta-fraca">
          {sku ? `Não encontrei o produto "${sku}" no cadastro do Precify.` : 'Escolha um produto para ver custo, preço atual, margem, gramaturas e promoções.'}
        </div>
      )}

      {item && a && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-4 lg:col-span-2">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-tinta font-titulo">{item.nome}</h2>
                  <p className="text-xs text-tinta-fraca">SKU {item.sku} · {item.fracionado ? 'fracionado (granel)' : 'por unidade'} · curva {item.curva} · vendeu {brl(item.receita90d)} em 90 dias nas lojas e no site</p>
                </div>
                <Sinal s={a.semaforo} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-rdb-50 rounded-xl p-3">
                  <div className="text-[11px] text-tinta-fraca">Preço atual no Bling</div>
                  <div className="text-lg font-bold text-tinta tabular-nums">{item.preco ? `${brl(item.preco)}` : 'sem preço'}</div>
                  <div className="text-[10px] text-tinta-fraca">por {un}{item.precoMedio30d != null && ` · vendido em média a ${brl(item.precoMedio30d)}`}</div>
                </div>
                <div className="bg-rdb-50 rounded-xl p-3">
                  <div className="text-[11px] text-tinta-fraca">Custo aplicado</div>
                  <div className="text-lg font-bold text-tinta tabular-nums">{brl(custo)}</div>
                  <div className="text-[10px] text-tinta-fraca">{num(custoSim) ? 'custo de teste' : item.dataUltimaCompra ? `última compra ${new Date(item.dataUltimaCompra).toLocaleDateString('pt-BR')}` : 'sem compra registrada'}</div>
                </div>
                <div className="bg-rdb-50 rounded-xl p-3">
                  <div className="text-[11px] text-tinta-fraca">Preço ideal para {pct(config.meta, 0)} de margem</div>
                  <div className="text-lg font-bold text-rdb-700 tabular-nums">{brl(a.precoIdeal)}</div>
                  <div className="text-[10px] text-tinta-fraca">
                    {a0?.ajusteParaMeta != null && item.preco ? (a0.ajusteParaMeta > 0.005 ? `faltam ${brl(a0.ajusteParaMeta)} no preço atual` : `preço atual está ${brl(-a0.ajusteParaMeta)} acima`) : 'por ' + un}
                  </div>
                </div>
                <div className="bg-rdb-50 rounded-xl p-3">
                  <div className="text-[11px] text-tinta-fraca">Margem ({base.toLowerCase()})</div>
                  <div className={`text-lg font-bold tabular-nums ${a.semaforo === 'VERMELHO' ? 'text-perigo' : a.semaforo === 'AMARELO' ? 'text-atencao' : 'text-ok'}`}>{pct(a.margem)}</div>
                  <div className="text-[10px] text-tinta-fraca">desconto máximo {pct(a.descontoMaximo)} ({brl(a.descontoMaximoReais)})</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 p-3 rounded-xl border border-dashed border-atencao/50 bg-atencao/5">
                <div>
                  <label className="lbl">Preço para simular (R$/{un}) — opcional</label>
                  <input className="inp" inputMode="decimal" value={precoSim} onChange={e => setPrecoSim(e.target.value)} placeholder={item.preco ? String(item.preco).replace('.', ',') : 'digite um preço'} />
                </div>
                <div>
                  <label className="lbl">Custo para simular (R$/{un}) — opcional</label>
                  <input className="inp" inputMode="decimal" value={custoSim} onChange={e => setCustoSim(e.target.value)} placeholder={item.custo ? String(item.custo).replace('.', ',') : 'digite um custo'} />
                </div>
                <p className="md:col-span-2 text-[11px] text-tinta-fraca">A simulação não altera nada no Bling nem no cadastro: serve só para testar. Preço usado nas contas abaixo: <strong className="text-tinta">{brl(precoUsado)}</strong> ({base.toLowerCase()}).</p>
              </div>
            </div>

            <div className="card p-4">
              <h2 className="section-title mb-3">Como a conta é feita</h2>
              <dl className="space-y-2 text-sm">
                {[
                  ['Imposto Simples', pct(config.imposto)],
                  ['Taxas de pagamento e caixa', pct(config.taxaVariavel, 2)],
                  ['Perda no fracionamento', pct(config.perda)],
                  ['Meta de margem', pct(config.meta, 0)],
                  ['Margem mínima por produto', pct(config.minimo, 0)],
                  ['Zona de atenção por pacote', pct(config.atencao, 0)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-tinta-fraca">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
                ))}
              </dl>
              <p className="text-[11px] text-tinta-fraca mt-3 leading-relaxed">
                Margem = preço − custo corrigido pela perda − embalagem − imposto e taxas sobre o preço. Frete grátis e caixa são avaliados por pedido, não por produto.
              </p>
            </div>
          </div>

          {item.fracionado && (
            <div className="card">
              <div className="px-4 py-3 border-b border-rdb-100">
                <h2 className="section-title">Preços proporcionais por gramatura</h2>
              </div>
              <table className="w-full">
                <thead className="tbl-head"><tr>
                  <th className="th">Gramatura</th><th className="th-r">Preço</th><th className="th-r">Embalagem</th>
                  <th className="th-r">Custo da compra</th><th className="th-r">Margem</th><th className="th text-center">Semáforo</th>
                </tr></thead>
                <tbody>
                  {pacotes.length === 0 && <tr><td colSpan={6} className="td text-center text-tinta-fraca py-6">Informe um preço para ver as gramaturas.</td></tr>}
                  {pacotes.map(p => (
                    <tr key={p.rotulo} className="tr-row">
                      <td className="td font-medium">{p.rotulo}</td>
                      <td className="td-r font-semibold">{brl(p.preco)}</td>
                      <td className="td-r text-xs">{brl(p.embalagem)}</td>
                      <td className="td-r text-xs">{brl(p.custo)}</td>
                      <td className="td-r font-semibold">{pct(p.margem)}</td>
                      <td className="td text-center"><Sinal s={p.semaforo} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <div className="px-4 py-3 border-b border-rdb-100">
              <h2 className="section-title">Simulações de promoção</h2>
              <p className="text-xs text-tinta-fraca mt-0.5">Margem estimada antes do frete; o limite de desconto mantém o piso de {pct(config.minimo, 0)}</p>
            </div>
            <table className="w-full">
              <thead className="tbl-head"><tr>
                <th className="th">Promoção</th><th className="th-r">Preço líquido por {un}</th><th className="th-r">Custo + embalagem</th>
                <th className="th-r">Margem após desconto</th><th className="th text-center">Semáforo</th><th className="th">Observação</th>
              </tr></thead>
              <tbody>
                {promos.length === 0 && <tr><td colSpan={6} className="td text-center text-tinta-fraca py-6">É preciso custo e preço para simular promoções.</td></tr>}
                {promos.map(p => (
                  <tr key={p.nome} className="tr-row">
                    <td className="td font-medium">{p.nome}</td>
                    <td className="td-r">{brl(p.precoLiquido)}</td>
                    <td className="td-r text-xs">{brl(p.custo)}</td>
                    <td className="td-r font-semibold">{pct(p.margem)}</td>
                    <td className="td text-center"><Sinal s={p.semaforo} /></td>
                    <td className="td text-xs text-tinta-fraca whitespace-normal">{p.obs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default function PrecificarPage() {
  return (
    <Suspense fallback={<div className="text-sm text-tinta-fraca py-8">Carregando…</div>}>
      <PrecificarContent />
    </Suspense>
  )
}
