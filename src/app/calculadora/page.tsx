'use client'
import { useState, useRef, useCallback } from 'react'
import { Search, Calculator, Save, RefreshCw, CheckCircle2, Info } from 'lucide-react'
import { Spinner, Alert } from '@/components/ui'

// ── Formatadores ─────────────────────────────────────────────
const brl = (v?: number | null) =>
  v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const pct = (v: number) => `${(v * 100).toFixed(1)}%`

// ── Tabela FULL ───────────────────────────────────────────────
const FAIXAS_PRECO = [
  { min: 0,   max: 18.99  }, { min: 19,  max: 28.99  },
  { min: 29,  max: 48.99  }, { min: 49,  max: 78.99  },
  { min: 79,  max: 98.99  }, { min: 99,  max: 198.99 },
  { min: 199, max: Infinity },
]
const TABELA_FULL: [number, number[]][] = [
  [0.3,  [1.25,1.50,2.00,3.00,4.00, 6.00, 20.95]],
  [0.5,  [1.25,1.50,2.00,3.00,4.00, 6.00, 22.55]],
  [1.0,  [1.25,1.50,2.00,3.00,4.00, 6.00, 23.65]],
  [2.0,  [1.75,2.00,2.50,3.50,4.50, 6.50, 24.65]],
  [3.0,  [2.00,2.50,3.00,4.00,5.00, 7.00, 26.25]],
  [5.0,  [2.50,3.50,4.00,5.00,6.00, 7.50, 30.75]],
  [10.0, [4.00,5.00,5.50,6.50,7.00, 7.50, 48.05]],
  [30.0, [5.00,6.00,6.50,7.00,7.50, 8.00,106.95]],
]
function freteFullCalc(pesoKg: number, preco: number): number {
  const col = FAIXAS_PRECO.findIndex(f => preco >= f.min && preco <= f.max)
  const c   = col === -1 ? 6 : col
  const row = TABELA_FULL.find(([max]) => pesoKg <= max) ?? TABELA_FULL[TABELA_FULL.length - 1]
  return row[1][c]
}
function freteFlexCalc(pesoKg: number): number {
  const t: [number, number][] = [[0.3,12],[0.5,14],[1,16],[2,19],[3,22],[5,27],[10,35],[30,55]]
  return (t.find(([max]) => pesoKg <= max) ?? t[t.length-1])[1]
}

// ── Motor de cálculo ──────────────────────────────────────────
function calcPreco(custo: number, comissao: number, imposto: number, margem: number) {
  const d = 1 - comissao - imposto - margem
  return d > 0 ? Math.round((custo / d) * 100) / 100 : 0
}

interface Canal {
  key: string; label: string; comissao: number; imposto: number
  embalagem: number; coleta: number; taxaFixa: number; tipoFrete: string
}

interface ResultadoVariacao {
  skuVariacao: string; nomeVariacao: string; pesoGramas: number | null; custoTotal: number
  canais: {
    canal: Canal
    frete: number; custoFinal: number
    precoMinimo: number; precoIdeal: number; precoMaximo: number; precoPromocional: number
    margemMinimo: number; margemIdeal: number; margemMaximo: number
  }[]
}

interface Variacao {
  id: string; skuVariacao: string; nomeVariacao: string
  pesoGramas: number | null; custoTotal: number | null; custoCalculado: number | null
}

interface Produto {
  skuPrincipal: string; nome: string; categoria: string
  custoPorKg: number | null; custoUnitario: number | null; custoAtualizado: number | null
  variacoes: Variacao[]
}

const CANAIS_PADRAO: Canal[] = [
  { key: 'ml_full',     label: 'ML FULL',     comissao: 0.14, imposto: 0.0829, embalagem: 0,    coleta: 0.60, taxaFixa: 0,    tipoFrete: 'full' },
  { key: 'ml_classico', label: 'ML Clássico', comissao: 0.14, imposto: 0.0829, embalagem: 0.60, coleta: 0,    taxaFixa: 1.25, tipoFrete: 'classico' },
  { key: 'shopee',      label: 'Shopee',      comissao: 0.20, imposto: 0.0829, embalagem: 0.60, coleta: 0,    taxaFixa: 4.00, tipoFrete: 'fixo' },
]

export default function CalculadoraPage() {
  const [q, setQ]               = useState('')
  const [produto, setProduto]   = useState<Produto | null>(null)
  const [loading, setLoading]   = useState(false)
  const [canais, setCanais]     = useState<Canal[]>(CANAIS_PADRAO)
  const [resultados, setResultados] = useState<ResultadoVariacao[]>([])
  const [calculado, setCalculado]   = useState(false)
  const [salvando, setSalvando]     = useState<Record<string, boolean>>({})
  const [salvos, setSalvos]         = useState<Record<string, boolean>>({})
  const [error, setError]           = useState('')
  const timer = useRef<NodeJS.Timeout>()

  // ── Buscar produto ou kit ─────────────────────────────────
  const buscarProduto = useCallback(async (sku: string) => {
    if (sku.length < 2) { setProduto(null); setResultados([]); setCalculado(false); return }
    setLoading(true)

    // Tentar produto primeiro
    const rProd = await fetch(`/api/produtos/${encodeURIComponent(sku)}`)
    if (rProd.ok) {
      const p = await rProd.json()
      setProduto(p)
      setResultados([])
      setCalculado(false)
      setLoading(false)
      return
    }

    // Se não encontrou produto, tentar kit
    const rKit = await fetch(`/api/kits/${encodeURIComponent(sku)}`)
    if (rKit.ok) {
      const kit = await rKit.json()
      // Converter kit para formato de produto com 1 variação
      const kitComoProduto = {
        skuPrincipal: kit.skuKit,
        nome: kit.nome,
        categoria: kit.categoria,
        custoAtualizado: kit.custoTotal,
        isKit: true,
        variacoes: [{
          skuVariacao: kit.skuKit + '-OKit',
          nomeVariacao: kit.nome,
          pesoGramas: null,
          custoTotal: kit.custoTotal,
          custoCalculado: kit.custoTotal,
          status: 'ativo',
        }],
      }
      setProduto(kitComoProduto as any)
      setResultados([])
      setCalculado(false)
    } else {
      setProduto(null)
    }
    setLoading(false)
  }, [])

  const handleQ = (v: string) => {
    setQ(v); clearTimeout(timer.current)
    timer.current = setTimeout(() => buscarProduto(v), 400)
  }

  // ── Calcular ──────────────────────────────────────────────
  const calcular = () => {
    if (!produto) return
    const vars = produto.variacoes

    const res: ResultadoVariacao[] = vars.map(v => {
      const custoTotal = v.custoTotal ?? v.custoCalculado ?? produto.custoAtualizado ?? 0
      const pesoKg = v.pesoGramas ? v.pesoGramas / 1000 : null

      const cols = canais.map(canal => {
        // Calcular frete
        let frete = 0
        if (canal.tipoFrete === 'full' && pesoKg) {
          // Para FULL, usamos preço ideal como referência inicial
          const custoFixo = custoTotal + canal.embalagem + canal.coleta
          const precoRef  = calcPreco(custoFixo, canal.comissao, canal.imposto, 0.25)
          frete = freteFullCalc(pesoKg, precoRef)
        } else if (canal.tipoFrete === 'classico' || canal.tipoFrete === 'flex') {
          frete = pesoKg ? freteFlexCalc(pesoKg) : 4.00
        } else {
          frete = 0 // taxa fixa já incluída em canal.taxaFixa
        }

        const custoFinal = custoTotal + canal.embalagem + canal.coleta + canal.taxaFixa + frete

        const pMin  = calcPreco(custoFinal, canal.comissao, canal.imposto, 0.20)
        const pIdeal = calcPreco(custoFinal, canal.comissao, canal.imposto, 0.25)
        const pMax  = calcPreco(custoFinal, canal.comissao, canal.imposto, 0.30)
        const pPromo = Math.round(pIdeal * 1.45 * 100) / 100

        return {
          canal, frete: Math.round(frete * 100) / 100,
          custoFinal: Math.round(custoFinal * 100) / 100,
          precoMinimo: pMin, precoIdeal: pIdeal,
          precoMaximo: pMax, precoPromocional: pPromo,
          margemMinimo: 0.20, margemIdeal: 0.25, margemMaximo: 0.30,
        }
      })

      return { skuVariacao: v.skuVariacao, nomeVariacao: v.nomeVariacao, pesoGramas: v.pesoGramas, custoTotal, canais: cols }
    })

    setResultados(res)
    setCalculado(true)
  }

  // ── Salvar como anúncio ───────────────────────────────────
  const salvarAnuncio = async (rv: ResultadoVariacao, col: ResultadoVariacao['canais'][0]) => {
    const key = `${rv.skuVariacao}_${col.canal.key}`
    setSalvando(p => ({ ...p, [key]: true }))
    setError('')

    const r = await fetch('/api/anuncios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skuVariacao:    rv.skuVariacao,
        canal:          col.canal.key,
        custoEmbalagem: col.canal.embalagem,
        custoColeta:    col.canal.coleta,
        custoFrete:     col.frete,
        comissaoPct:    col.canal.comissao,
        impostoPct:     col.canal.imposto,
        precoAtual:     col.precoPromocional, // sobe com preço promocional
        ativo:          true,
      }),
    })

    const text = await r.text()
    if (!r.ok) {
      let msg = 'Erro ao salvar anúncio'
      try { msg = JSON.parse(text)?.error ?? msg } catch {}
      setError(msg)
    } else {
      let atualizado = false
      try { atualizado = JSON.parse(text)?._atualizado ?? false } catch {}
      setSalvos(p => ({ ...p, [key]: atualizado ? 'Atualizado!' : 'Salvo!' }))
      setTimeout(() => setSalvos(p => ({ ...p, [key]: '' })), 4000)
    }
    setSalvando(p => ({ ...p, [key]: false }))
  }

  const salvarTodos = async (rv: ResultadoVariacao) => {
    for (const col of rv.canais) {
      await salvarAnuncio(rv, col)
    }
  }

  const fc = (i: number, k: keyof Canal) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCanais(prev => prev.map((c, idx) => idx === i ? { ...c, [k]: parseFloat(e.target.value) || 0 } : c))
    setCalculado(false)
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Calculator size={22} className="text-indigo-500" /> Calculadora de Precificação
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Digite o SKU, ajuste os parâmetros e veja o preço ideal para cada canal e variação
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Painel esquerdo: busca + parâmetros ── */}
        <div className="space-y-4">
          {/* Busca por SKU */}
          <div className="card p-4">
            <label className="lbl">SKU do produto</label>
            <div className="relative">
              <div className="absolute left-3 top-2.5 text-gray-400"><Search size={15} /></div>
              <input className="inp pl-9 pr-8" value={q} onChange={e => handleQ(e.target.value)}
                placeholder="Ex: 242, VS000592…" autoFocus />
              {loading && <div className="absolute right-3 top-2.5"><Spinner size={14} /></div>}
            </div>

            {produto && (
              <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                <div className="font-semibold text-indigo-800">{produto.nome}</div>
                <div className="text-xs text-indigo-500 mt-0.5">{produto.categoria} · SKU {produto.skuPrincipal}</div>
                <div className="text-xs text-indigo-700 mt-1">
                  Custo/kg: <strong>{brl(produto.custoAtualizado)}</strong>
                  · {produto.variacoes.length} variação(ões)
                </div>
              </div>
            )}
            {q.length >= 2 && !produto && !loading && (
              <p className="text-xs text-red-500 mt-2">Produto não encontrado. Verifique o SKU.</p>
            )}
          </div>

          {/* Parâmetros por canal */}
          <div className="card p-4">
            <h3 className="section-title mb-3">Parâmetros por canal</h3>
            <div className="space-y-4">
              {canais.map((c, i) => (
                <div key={c.key}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`badge text-xs font-semibold ${c.key === 'shopee' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {c.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="lbl">Comissão</label>
                      <input className="inp-sm" type="number" step="0.001" value={c.comissao}
                        onChange={fc(i, 'comissao')} />
                    </div>
                    <div>
                      <label className="lbl">Imposto</label>
                      <input className="inp-sm" type="number" step="0.0001" value={c.imposto}
                        onChange={fc(i, 'imposto')} />
                    </div>
                    {c.key !== 'ml_full' && (
                      <div>
                        <label className="lbl">Embalagem R$</label>
                        <input className="inp-sm" type="number" step="0.01" value={c.embalagem}
                          onChange={fc(i, 'embalagem')} />
                      </div>
                    )}
                    {c.key === 'ml_full' && (
                      <div>
                        <label className="lbl">Coleta R$/un</label>
                        <input className="inp-sm" type="number" step="0.01" value={c.coleta}
                          onChange={fc(i, 'coleta')} />
                      </div>
                    )}
                    {c.taxaFixa !== undefined && c.key !== 'ml_full' && (
                      <div>
                        <label className="lbl">Taxa fixa R$</label>
                        <input className="inp-sm" type="number" step="0.01" value={c.taxaFixa}
                          onChange={fc(i, 'taxaFixa')} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Botão calcular */}
          <button onClick={calcular} disabled={!produto}
            className="btn-primary w-full justify-center py-3 text-base font-semibold disabled:opacity-40">
            <Calculator size={18} /> Calcular preços
          </button>
        </div>

        {/* ── Painel direito: resultados ── */}
        <div className="lg:col-span-2 space-y-4">
          {!calculado && (
            <div className="card p-12 text-center text-gray-400">
              <Calculator size={40} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">Digite um SKU e clique em Calcular preços</p>
              <p className="text-sm mt-1">Os preços aparecerão aqui para todas as variações e canais</p>
            </div>
          )}

          {calculado && resultados.map(rv => (
            <div key={rv.skuVariacao} className="card overflow-hidden">
              {/* Header da variação */}
              <div className="px-4 py-3 bg-gray-900 text-white flex items-center justify-between">
                <div>
                  <span className="font-semibold">{rv.nomeVariacao}</span>
                  <span className="text-gray-400 text-xs ml-2 font-mono">{rv.skuVariacao}</span>
                  {rv.pesoGramas && <span className="text-gray-400 text-xs ml-2">{rv.pesoGramas}g</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">Custo: <strong className="text-white">{brl(rv.custoTotal)}</strong></span>
                  <button onClick={() => salvarTodos(rv)}
                    className="btn-sm bg-indigo-500 text-white hover:bg-indigo-400 text-xs">
                    <Save size={12} /> Salvar todos
                  </button>
                </div>
              </div>

              {/* Tabela por canal */}
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="tbl-head">
                    <tr>
                      <th className="th">Canal</th>
                      <th className="th-r">Frete</th>
                      <th className="th-r">Custo total</th>
                      <th className="th-r text-amber-600">Mínimo (20%)</th>
                      <th className="th-r text-indigo-600">Ideal (25%) ★</th>
                      <th className="th-r text-emerald-600">Máximo (30%)</th>
                      <th className="th-r text-purple-600">Promoção</th>
                      <th className="th text-center">Salvar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rv.canais.map(col => {
                      const key = `${rv.skuVariacao}_${col.canal.key}`
                      const isSalvando = salvando[key]
                      const isSalvo    = !!salvos[key]
                      return (
                        <tr key={col.canal.key} className="tr-row">
                          <td className="td">
                            <span className={`badge text-xs font-semibold ${col.canal.key === 'shopee' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-800'}`}>
                              {col.canal.label}
                            </span>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {pct(col.canal.comissao)} comissão · {pct(col.canal.imposto)} imposto
                              {col.canal.embalagem > 0 && ` · embal. ${brl(col.canal.embalagem)}`}
                              {col.canal.coleta > 0 && ` · coleta ${brl(col.canal.coleta)}`}
                              {col.canal.taxaFixa > 0 && ` · taxa fixa ${brl(col.canal.taxaFixa)}`}
                            </div>
                          </td>
                          <td className="td-r text-xs text-indigo-600 font-medium">{brl(col.frete)}</td>
                          <td className="td-r text-xs font-semibold">{brl(col.custoFinal)}</td>
                          <td className="td-r">
                            <div className="font-semibold text-amber-700">{brl(col.precoMinimo)}</div>
                            <div className="text-[10px] text-gray-400">margem 20%</div>
                          </td>
                          <td className="td-r bg-indigo-50/50">
                            <div className="font-bold text-indigo-700 text-base">{brl(col.precoIdeal)}</div>
                            <div className="text-[10px] text-gray-400">margem 25%</div>
                          </td>
                          <td className="td-r">
                            <div className="font-semibold text-emerald-700">{brl(col.precoMaximo)}</div>
                            <div className="text-[10px] text-gray-400">margem 30%</div>
                          </td>
                          <td className="td-r">
                            <div className="font-bold text-purple-700 text-base">{brl(col.precoPromocional)}</div>
                            <div className="text-[10px] text-gray-400">ideal × 1,45</div>
                          </td>
                          <td className="td text-center">
                            {isSalvo ? (
                              <span className="text-emerald-500 flex items-center justify-center gap-1 text-xs">
                                <CheckCircle2 size={14} /> {salvos[key]}
                              </span>
                            ) : (
                              <button onClick={() => salvarAnuncio(rv, col)} disabled={isSalvando}
                                className="btn-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200">
                                {isSalvando ? <Spinner size={12} /> : <Save size={12} />}
                                {isSalvando ? '…' : 'Salvar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Nota sobre preço promocional */}
              <div className="px-4 py-2.5 bg-purple-50 border-t border-purple-100 flex items-start gap-2">
                <Info size={13} className="text-purple-500 shrink-0 mt-0.5" />
                <p className="text-xs text-purple-700">
                  <strong>Estratégia de preço:</strong> suba o produto com o <strong>preço promocional</strong> (ideal × 1,45).
                  Ao colocar em promoção com desconto de ~31%, o preço chega ao valor ideal mantendo margem de 25%.
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
