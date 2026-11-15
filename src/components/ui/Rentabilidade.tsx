'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Spinner } from '@/components/ui'

const real0 = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const pct = (v: number | null) => v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`

interface Canal {
  canal: string; plataforma: string | null; pedidos: number
  receita: number; descontos: number; receita_liquida: number
  cmv: number; taxas_canal: number; taxa_origem: string | null; impostos: number
  margem_contribuicao: number; publicidade: number; frete_liquido: number; outras_diretas: number
  resultado_direto: number; cobertura_custo_pct: number | null
}
interface Produto {
  canal: string; sku: string; descricao: string; qtd: number; receita: number
  margem_bruta_pct: number | null; preco_medio: number | null; custo_medio: number | null; sem_custo: boolean
}

const ehProprio = (c: Canal) => c.plataforma === 'loja_propria'
const n = (v: unknown) => Number(v) || 0

/**
 * Rentabilidade do mês por canal, lida do Farol.
 * escopo "proprio" = loja física, filial e site; "marketplace" = Mercado Livre, Shopee, TikTok.
 */
export default function Rentabilidade({ mes, escopo, comProdutos = false }: { mes: string; escopo: 'proprio' | 'marketplace'; comProdutos?: boolean }) {
  const [canais, setCanais] = useState<Canal[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [canalSel, setCanalSel] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try {
      const r = await fetch(`/api/rentabilidade?mes=${mes}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(d.error ?? 'Não foi possível carregar a rentabilidade.'); setCanais([]); setProdutos([]); return }
      setCanais(d.canais ?? []); setProdutos(d.produtos_marketplace ?? [])
    } catch { setErro('Falha de conexão ao carregar a rentabilidade.') }
    finally { setLoading(false) }
  }, [mes])
  useEffect(() => { carregar() }, [carregar])

  const doEscopo = useMemo(() => canais.filter(c => (escopo === 'proprio' ? ehProprio(c) : !ehProprio(c))), [canais, escopo])
  // visão individual: com um canal escolhido, cartões, tabela, "R$ 100" e produtos mostram só ele
  const canalValido = doEscopo.some(c => c.canal === canalSel) ? canalSel : ''
  const lista = useMemo(() => (canalValido ? doEscopo.filter(c => c.canal === canalValido) : doEscopo), [doEscopo, canalValido])
  const t = useMemo(() => {
    const soma = (k: keyof Canal) => lista.reduce((s, c) => s + n(c[k]), 0)
    const rec = soma('receita_liquida')
    return {
      pedidos: soma('pedidos'), receita: rec, cmv: soma('cmv'), taxas: soma('taxas_canal'), impostos: soma('impostos'),
      mc: soma('margem_contribuicao'), ads: soma('publicidade'), frete: soma('frete_liquido'), outras: soma('outras_diretas'),
      resultado: soma('resultado_direto'),
      cobertura: rec > 0 ? lista.reduce((s, c) => s + n(c.cobertura_custo_pct) * n(c.receita_liquida), 0) / rec : null,
    }
  }, [lista])
  const sobre = (v: number) => (t.receita > 0 ? v / t.receita : null)

  // margem estimada do produto depois de taxa e imposto, pela taxa média do próprio canal
  const taxaDoCanal = useMemo(() => new Map(lista.map(c => [c.canal, n(c.receita_liquida) > 0 ? (n(c.taxas_canal) + n(c.impostos)) / n(c.receita_liquida) : 0])), [lista])
  const prods = useMemo(() => produtos
    .filter(p => !canalValido || p.canal === canalValido)
    .map(p => ({ ...p, margemLiquida: p.margem_bruta_pct == null ? null : n(p.margem_bruta_pct) / 100 - (taxaDoCanal.get(p.canal) ?? 0) }))
    .sort((a, b) => n(b.receita) - n(a.receita)), [produtos, canalValido, taxaDoCanal])

  if (loading) return <div className="card p-8 text-center"><Spinner size={16} className="mx-auto" /></div>
  if (erro) return <div className="bg-atencao/5 border border-atencao/30 rounded-xl p-3 text-sm text-atencao">{erro}</div>
  if (!doEscopo.length) return <div className="card p-8 text-center text-sm text-tinta-fraca">Sem vendas {escopo === 'proprio' ? 'em loja e site' : 'em marketplaces'} neste mês.</div>

  const destino = [
    { rotulo: 'CMV (custo dos produtos)', valor: t.cmv, cor: '#055E2B' },
    { rotulo: 'Imposto', valor: t.impostos, cor: '#7A8F84' },
    { rotulo: escopo === 'proprio' ? 'Taxas de pagamento' : 'Taxas e comissão do canal', valor: t.taxas, cor: '#E09E12' },
    { rotulo: 'Publicidade', valor: t.ads, cor: '#B4571E' },
    { rotulo: 'Frete por nossa conta', valor: t.frete, cor: '#5B7DB1' },
    { rotulo: 'Outras despesas diretas', valor: t.outras, cor: '#9A8C6B' },
    { rotulo: 'Resultado direto', valor: t.resultado, cor: t.resultado >= 0 ? '#2E9E4F' : '#A21309' },
  ].filter(d => Math.abs(d.valor) >= 0.5)

  return (
    <div className="space-y-4">
      {doEscopo.length > 1 && (
        <div className="flex gap-1 bg-rdb-100/60 p-1 rounded-xl w-fit flex-wrap">
          {[{ canal: '', rotulo: escopo === 'proprio' ? 'Todos os canais' : 'Todos os marketplaces' }, ...doEscopo.map(c => ({ canal: c.canal, rotulo: c.canal }))].map(o => (
            <button key={o.canal} onClick={() => setCanalSel(o.canal)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${canalValido === o.canal ? 'bg-white text-tinta shadow-sm' : 'text-tinta-fraca hover:text-tinta'}`}>
              {o.rotulo}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { rotulo: 'Faturamento líquido', valor: real0(t.receita), sub: `${new Intl.NumberFormat('pt-BR').format(t.pedidos)} pedidos` },
          { rotulo: 'CMV', valor: pct(sobre(t.cmv)), sub: `${real0(t.cmv)} em custo de produto` },
          { rotulo: 'Margem de contribuição', valor: pct(sobre(t.mc)), sub: `${real0(t.mc)} após CMV, imposto e taxas` },
          { rotulo: 'Resultado direto', valor: pct(sobre(t.resultado)), sub: `${real0(t.resultado)} após publicidade, frete e despesas`, cor: t.resultado < 0 ? 'text-perigo' : 'text-ok' },
        ].map(c => (
          <div key={c.rotulo} className="card p-4">
            <div className="text-xs text-tinta-fraca">{c.rotulo}</div>
            <div className={`stat-value mt-0.5 ${c.cor ?? 'text-tinta'}`}>{c.valor}</div>
            <div className="text-[11px] text-tinta-fraca mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card xl:col-span-2 overflow-auto">
          <table className="w-full">
            <thead className="tbl-head"><tr>
              <th className="th">Canal</th><th className="th-r">Pedidos</th><th className="th-r">Faturam.</th><th className="th-r">CMV</th>
              <th className="th-r">Taxas</th><th className="th-r">Margem</th>{t.ads > 0 && <th className="th-r">Publicidade</th>}<th className="th-r">Resultado</th>
            </tr></thead>
            <tbody>
              {lista.map(c => {
                const rec = n(c.receita_liquida), p = (v: number) => (rec > 0 ? v / rec : null)
                return (
                  <tr key={c.canal} className="tr-row">
                    <td className="td font-medium">
                      {c.canal}
                      {c.taxa_origem && !ehProprio(c) && <div className="text-[10px] text-tinta-fraca font-normal">taxa {c.taxa_origem}</div>}
                    </td>
                    <td className="td-r text-xs">{new Intl.NumberFormat('pt-BR').format(n(c.pedidos))}</td>
                    <td className="td-r">{real0(rec)}</td>
                    <td className="td-r text-xs">{pct(p(n(c.cmv)))}</td>
                    <td className="td-r text-xs">{pct(p(n(c.taxas_canal)))}</td>
                    <td className="td-r font-semibold">{pct(p(n(c.margem_contribuicao)))}</td>
                    {t.ads > 0 && <td className="td-r text-xs">{n(c.publicidade) ? real0(n(c.publicidade)) : '—'}</td>}
                    <td className={`td-r font-semibold ${n(c.resultado_direto) < 0 ? 'text-perigo' : 'text-ok'}`}>
                      {real0(n(c.resultado_direto))} <span className="text-[10px] font-normal text-tinta-fraca">{pct(p(n(c.resultado_direto)))}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {t.cobertura != null && t.cobertura < 99 && (
            <p className="text-[11px] text-tinta-fraca px-4 py-2 border-t border-rdb-100">
              {t.cobertura.toFixed(0)}% do faturamento tem custo cadastrado; o restante entra sem CMV, então a margem real é um pouco menor.
            </p>
          )}
        </div>

        <div className="card p-4">
          <h3 className="section-title mb-3">Para onde vai cada R$ 100 vendidos</h3>
          <div className="space-y-2">
            {destino.map(d => {
              const v = t.receita > 0 ? (d.valor / t.receita) * 100 : 0
              return (
                <div key={d.rotulo}>
                  <div className="flex justify-between text-xs"><span className="text-tinta">{d.rotulo}</span><span className="tabular-nums font-medium">{brl(v)}</span></div>
                  <div className="h-1.5 bg-rdb-50 rounded-full mt-1"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.abs(v))}%`, backgroundColor: d.cor }} /></div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {comProdutos && (
        <div className="card">
          <div className="px-4 py-3 border-b border-rdb-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="section-title">Produtos que mais vendem {canalValido ? `— ${canalValido}` : 'nos marketplaces'}</h3>
              <p className="text-xs text-tinta-fraca mt-0.5">Margem após taxa e imposto estimada pela taxa média do canal no mês; publicidade e frete não entram por produto</p>
            </div>
          </div>
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full">
              <thead className="tbl-head sticky top-0"><tr>
                <th className="th">Produto</th>{!canalValido && <th className="th">Canal</th>}<th className="th-r">Qtd</th><th className="th-r">Faturamento</th>
                <th className="th-r">Preço médio</th><th className="th-r">Custo médio</th><th className="th-r">Margem bruta</th><th className="th-r">Após taxa e imposto</th>
              </tr></thead>
              <tbody>
                {!prods.length && <tr><td colSpan={8} className="td text-center text-tinta-fraca py-8">Sem produtos neste canal.</td></tr>}
                {prods.map(p => (
                  <tr key={p.canal + p.sku} className="tr-row">
                    <td className="td">
                      <div className="font-medium text-tinta max-w-[300px] truncate" title={p.descricao}>{p.descricao}</div>
                      <div className="text-[10px] text-tinta-fraca font-mono">{p.sku}</div>
                    </td>
                    {!canalValido && <td className="td text-xs">{p.canal}</td>}
                    <td className="td-r text-xs">{new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n(p.qtd))}</td>
                    <td className="td-r">{real0(n(p.receita))}</td>
                    <td className="td-r text-xs">{brl(p.preco_medio)}</td>
                    <td className="td-r text-xs">{p.sem_custo ? <span className="badge-gray">sem custo</span> : brl(p.custo_medio)}</td>
                    <td className="td-r text-xs">{p.margem_bruta_pct == null ? '—' : pct(n(p.margem_bruta_pct) / 100)}</td>
                    <td className={`td-r font-bold ${p.margemLiquida == null ? 'text-tinta-fraca' : p.margemLiquida < 0.18 ? 'text-perigo' : p.margemLiquida < 0.3 ? 'text-atencao' : 'text-ok'}`}>{pct(p.margemLiquida)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
