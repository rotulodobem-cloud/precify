'use client'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, Settings2, X, ChevronDown, Megaphone } from 'lucide-react'
import { Spinner, Alert } from '@/components/ui'
import {
  CONFIG_MKT_PADRAO, CAMPOS_CONFIG_MKT, resultado, precoParaMargem, precoCadastro, acrescimoCadastro,
  lerCampo, gravarCampo, type ConfigMkt, type Canal, type Semaforo, type EntradaMkt,
} from '@/lib/precificacaoMkt'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const pct = (v?: number | null, casas = 1) => v != null ? `${(v * 100).toFixed(casas).replace('.', ',')}%` : '—'
const num = (s: string) => { const v = parseFloat(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : null }
const txt = (v: number) => String(+v.toFixed(2)).replace('.', ',')

interface Item { sku: string; nome: string; fracionado: boolean; custo: number | null; curva: string; receitaMkt90d: number }

const GRAMATURAS = [{ r: '100 g', f: 0.1 }, { r: '250 g', f: 0.25 }, { r: '500 g', f: 0.5 }, { r: '1 kg', f: 1 }]
const COR: Record<Semaforo, string> = {
  VERDE: 'bg-ok/10 text-ok border-ok/30', AMARELO: 'bg-atencao/10 text-atencao border-atencao/30', VERMELHO: 'bg-perigo/10 text-perigo border-perigo/30',
}
const COR_TXT: Record<Semaforo, string> = { VERDE: 'text-ok', AMARELO: 'text-atencao', VERMELHO: 'text-perigo' }
const NOME: Record<Canal, string> = { ml: 'Mercado Livre Full Super', shopee: 'Shopee', tiktok: 'TikTok Shop' }

function PainelCanal({ canal, entrada, precoTeste, cfg }: { canal: Canal; entrada: EntradaMkt | null; precoTeste: number | null; cfg: ConfigMkt }) {
  const [abrir, setAbrir] = useState(false)
  if (!entrada) {
    return <div className="card p-6 text-sm text-tinta-fraca text-center"><h2 className="section-title mb-2 text-tinta">{NOME[canal]}</h2>Informe o custo do item para calcular.</div>
  }
  const ideal = precoParaMargem(canal, cfg.meta, entrada, cfg)
  const piso = precoParaMargem(canal, cfg.piso, entrada, cfg)
  const preco = precoTeste ?? ideal.preco
  const r = preco != null ? resultado(canal, preco, entrada, cfg) : null

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-rdb-100 flex items-center justify-between">
        <h2 className="section-title">{NOME[canal]}</h2>
        {r && <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 ${COR[r.semaforo]}`}>{r.semaforo}</span>}
      </div>

      {!r ? (
        <p className="p-6 text-sm text-perigo">Com essas taxas não existe preço que entregue a meta de {pct(cfg.meta, 0)}: comissão, Ads, imposto e margem somam mais que o preço. Revise Ads ou a meta em Parâmetros.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-px bg-rdb-100">
            <div className="bg-white p-4">
              <div className="text-[11px] text-tinta-fraca">{precoTeste != null ? 'Margem no preço testado' : 'Margem no preço ideal'}</div>
              <div className={`text-3xl font-bold font-titulo tabular-nums ${COR_TXT[r.semaforo]}`}>{pct(r.margemPct)}</div>
              <div className="text-xs text-tinta-fraca">sobram {brl(r.margem)} por unidade vendida a {brl(r.preco)}</div>
            </div>
            <div className="bg-white p-4 space-y-2">
              {[{ rotulo: `Preço ideal (meta ${pct(cfg.meta, 0)})`, p: ideal.preco, forte: true }, { rotulo: `Preço mínimo (piso ${pct(cfg.piso, 0)})`, p: piso.preco, forte: false }].map(l => (
                <div key={l.rotulo}>
                  <div className="text-[11px] text-tinta-fraca">{l.rotulo}</div>
                  {l.p == null ? <div className="text-sm text-perigo">não existe com essas taxas</div> : (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`tabular-nums font-bold ${l.forte ? 'text-lg text-rdb-700' : 'text-base text-tinta'}`}>{brl(l.p)}</span>
                      <span className="text-[11px] text-tinta-fraca">cadastrar a <strong className="text-tinta">{brl(precoCadastro(l.p, cfg))}</strong></span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <table className="w-full border-t border-rdb-100">
            <tbody>
              <tr className="tr-row"><td className="td font-medium">Preço que o cliente paga</td><td className="td-r font-semibold">{brl(r.preco)}</td><td className="td-r text-xs text-tinta-fraca w-16">100%</td></tr>
              {r.linhas.map(l => (
                <tr key={l.rotulo} className="tr-row">
                  <td className="td text-tinta-fraca">− {l.rotulo}</td>
                  <td className="td-r">{brl(l.valor)}</td>
                  <td className="td-r text-xs text-tinta-fraca">{pct(l.valor / r.preco)}</td>
                </tr>
              ))}
              <tr><td className="td font-semibold">Margem de contribuição</td><td className={`td-r font-bold ${COR_TXT[r.semaforo]}`}>{brl(r.margem)}</td><td className={`td-r text-xs font-semibold ${COR_TXT[r.semaforo]}`}>{pct(r.margemPct)}</td></tr>
            </tbody>
          </table>

          <button onClick={() => setAbrir(a => !a)} className="w-full flex items-center justify-between px-4 py-2 text-xs text-tinta-fraca hover:bg-rdb-50 border-t border-rdb-100">
            Como o preço ideal foi achado, por faixa de preço <ChevronDown size={13} className={abrir ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {abrir && (
            <div className="overflow-auto border-t border-rdb-100">
              <table className="w-full">
                <thead className="tbl-head"><tr>
                  <th className="th">Faixa de preço</th><th className="th-r">{canal === 'ml' ? 'Envio' : 'Taxa fixa'}</th>
                  <th className="th-r">Preço p/ meta</th><th className="th-r">Válido</th><th className="th-r">Preço p/ piso</th><th className="th-r">Válido</th>
                </tr></thead>
                <tbody>
                  {ideal.faixas.map((f, i) => (
                    <tr key={f.de} className="tr-row">
                      <td className="td text-xs">{brl(f.de)} {f.ate != null ? `a ${brl(f.ate)}` : 'ou mais'}</td>
                      <td className="td-r text-xs">{brl(f.custoFaixa)}</td>
                      <td className="td-r text-xs text-tinta-fraca">{brl(f.preco)}</td>
                      <td className={`td-r text-xs ${f.valido != null && f.valido === ideal.preco ? 'font-bold text-rdb-700' : ''}`}>{f.valido != null ? brl(f.valido) : '—'}</td>
                      <td className="td-r text-xs text-tinta-fraca">{brl(piso.faixas[i].preco)}</td>
                      <td className={`td-r text-xs ${piso.faixas[i].valido != null && piso.faixas[i].valido === piso.preco ? 'font-bold text-tinta' : ''}`}>{piso.faixas[i].valido != null ? brl(piso.faixas[i].valido) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-tinta-fraca px-4 py-2">
                {canal === 'ml' ? 'O envio do Full Super' : canal === 'shopee' ? 'A taxa fixa da Shopee' : 'A comissão e a taxa fixa do TikTok'} muda conforme a faixa de preço. Vale o menor preço que cai dentro da própria faixa; quando a conta dá abaixo do início da faixa, vale o início.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Conteudo() {
  const sp = useSearchParams()
  const router = useRouter()
  const [itens, setItens] = useState<Item[]>([])
  const [cfg, setCfg] = useState<ConfigMkt>(CONFIG_MKT_PADRAO)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [sku, setSku] = useState(sp.get('sku') ?? '')
  const [fator, setFator] = useState(1)
  const [custoTxt, setCustoTxt] = useState('')
  const [pesoTxt, setPesoTxt] = useState('')
  const [vendaTxt, setVendaTxt] = useState('')
  const [comissaoTxt, setComissaoTxt] = useState('')
  const [adsMlTxt, setAdsMlTxt] = useState('')
  const [adsShTxt, setAdsShTxt] = useState('')
  const [adsTtTxt, setAdsTtTxt] = useState('')
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true); setErro('')
    try {
      const [r, rc] = await Promise.all([fetch('/api/precificar'), fetch('/api/precificar-mkt/config')])
      if (!r.ok || !rc.ok) throw new Error()
      const d = await r.json()
      setItens(d.itens); setCfg(await rc.json())
    } catch { setErro('Não foi possível carregar os dados. Tente de novo.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const item = useMemo(() => itens.find(i => i.sku.toLowerCase() === sku.trim().toLowerCase()) ?? null, [itens, sku])
  const sugestoes = useMemo(() => {
    const b = busca.trim().toLowerCase()
    if (b.length < 2) return []
    return itens.filter(i => i.sku.toLowerCase().includes(b) || i.nome.toLowerCase().includes(b))
      .sort((a, c) => Number(c.sku.toLowerCase() === b) - Number(a.sku.toLowerCase() === b) || c.receitaMkt90d - a.receitaMkt90d).slice(0, 8)
  }, [itens, busca])

  const escolher = (s: string) => {
    setSku(s); setBusca(''); setCustoTxt(''); setPesoTxt(''); setVendaTxt('')
    router.replace(`/precificar-marketplaces?sku=${encodeURIComponent(s)}`, { scroll: false })
  }

  // custo do item anunciado: granel = custo por kg × gramatura; unidade = custo unitário
  const f = item?.fracionado ? fator : 1
  const custoAuto = item?.custo != null ? item.custo * f : null
  const custo = num(custoTxt) ?? custoAuto
  const pesoKg = num(pesoTxt) ?? (item ? (item.fracionado ? fator : 0.3) : 1)
  const precoTeste = num(vendaTxt)
  const entrada: EntradaMkt | null = custo != null && custo > 0 ? {
    custo, pesoKg,
    comissaoML: num(comissaoTxt) != null ? num(comissaoTxt)! / 100 : undefined,
    adsML: num(adsMlTxt) != null ? num(adsMlTxt)! / 100 : undefined,
    adsShopee: num(adsShTxt) != null ? num(adsShTxt)! / 100 : undefined,
    adsTiktok: num(adsTtTxt) != null ? num(adsTtTxt)! / 100 : undefined,
  } : null

  const abrirConfig = () => {
    setForm(Object.fromEntries(CAMPOS_CONFIG_MKT.flatMap(g => g.campos).map(c => {
      const v = lerCampo(cfg, c.caminho)
      return [c.caminho, String(c.tipo === 'pct' ? +(v * 100).toFixed(4) : v).replace('.', ',')]
    })))
    setEditando(true)
  }
  const salvarConfig = async () => {
    setSalvando(true); setErro('')
    let novo = cfg
    for (const c of CAMPOS_CONFIG_MKT.flatMap(g => g.campos)) {
      const v = parseFloat((form[c.caminho] ?? '').replace(',', '.'))
      novo = gravarCampo(novo, c.caminho, c.tipo === 'pct' ? v / 100 : v)
    }
    try {
      const r = await fetch('/api/precificar-mkt/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(novo) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(d.error ?? 'Não foi possível salvar os parâmetros.'); return }
      setCfg(d); setEditando(false)
    } catch { setErro('Falha de conexão ao salvar os parâmetros.') }
    finally { setSalvando(false) }
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Precificar — marketplaces</h1>
          <p className="text-sm text-tinta-fraca mt-0.5">Mercado Livre Full Super, Shopee e TikTok Shop: quanto sobra em cada um e a que preço cadastrar o anúncio</p>
        </div>
        <div className="flex gap-2">
          <Link href="/painel-marketplaces" className="btn-ghost text-xs">Painel de marketplaces</Link>
          <button onClick={abrirConfig} className="btn-ghost text-xs"><Settings2 size={13} /> Parâmetros</button>
        </div>
      </div>

      {erro && <Alert type="error">{erro}</Alert>}

      <div className="flex items-start gap-3 rounded-xl border border-rdb-200 bg-rdb-50 px-4 py-3 text-sm text-tinta">
        <Megaphone size={16} className="text-rdb-700 mt-0.5 shrink-0" />
        <span>
          <strong>Estratégia de cadastro:</strong> o anúncio sobe com o preço cheio e entra em promoção de {pct(cfg.descontoPromocao, 0)}, chegando ao preço de venda
          (o preço cheio fica {pct(acrescimoCadastro(cfg))} acima). As taxas e a margem são calculadas sobre o preço que o cliente paga, em promoção. Ao lado de cada preço aparece o valor para cadastrar.
        </span>
      </div>

      {editando && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Parâmetros dos marketplaces (valem para todos os produtos)</h2>
            <button onClick={() => setEditando(false)} className="text-tinta-fraca hover:text-tinta"><X size={16} /></button>
          </div>
          {CAMPOS_CONFIG_MKT.map(g => (
            <div key={g.grupo} className="mb-3">
              <div className="text-xs font-semibold text-tinta mb-1.5">{g.grupo}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {g.campos.map(c => (
                  <div key={c.caminho}>
                    <label className="lbl">{c.rotulo} ({c.tipo === 'pct' ? '%' : 'R$'})</label>
                    <input className="inp" inputMode="decimal" value={form[c.caminho] ?? ''} onChange={e => setForm(p => ({ ...p, [c.caminho]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-tinta-fraca">As tabelas de envio do Full Super e de taxa fixa da Shopee por faixa de preço são as da planilha (MKT CONFIG) e ficam fixas no sistema.</p>
          <div className="flex justify-end gap-2 mt-3">
            <button className="btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
            <button className="btn-primary" onClick={salvarConfig} disabled={salvando}>{salvando && <Spinner size={13} />} Salvar parâmetros</button>
          </div>
        </div>
      )}

      <div className="card p-4 relative">
        <label className="lbl">Produto (SKU-base ou parte do nome) — ou preencha os campos abaixo direto</label>
        <div className="flex items-center gap-2 bg-white border border-rdb-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-rdb-700">
          <Search size={15} className="text-tinta-fraca" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder={loading ? 'Carregando catálogo…' : item ? `${item.nome} (${item.sku})` : 'Ex.: 161 ou colorau'}
            value={busca} onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && sugestoes[0]) escolher(sugestoes[0].sku) }} />
          {item && <button onClick={() => { setSku(''); setCustoTxt(''); setPesoTxt(''); router.replace('/precificar-marketplaces', { scroll: false }) }} className="text-xs text-tinta-fraca hover:text-tinta whitespace-nowrap">limpar produto</button>}
        </div>
        {sugestoes.length > 0 && (
          <div className="absolute left-4 right-4 top-[68px] z-20 bg-white border border-rdb-200 rounded-xl shadow-xl overflow-hidden">
            {sugestoes.map(s => (
              <button key={s.sku} onClick={() => escolher(s.sku)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-rdb-50 border-b border-rdb-50 last:border-0">
                <span className="text-sm text-tinta truncate">{s.nome}</span>
                <span className="text-xs text-tinta-fraca font-mono shrink-0">{s.sku}{s.receitaMkt90d > 0 && ` · ${brl(s.receitaMkt90d)} em marketplaces/90d`}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {item?.fracionado && (
            <div>
              <label className="lbl">Gramatura do anúncio</label>
              <div className="flex gap-1">
                {GRAMATURAS.map(g => (
                  <button key={g.r} onClick={() => { setFator(g.f); setCustoTxt(''); setPesoTxt('') }}
                    className={`flex-1 text-xs rounded-lg border px-1 py-2 ${fator === g.f ? 'bg-rdb-700 text-white border-rdb-700' : 'bg-white border-rdb-200 text-tinta hover:bg-rdb-50'}`}>{g.r}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="lbl">Custo do item anunciado (R$)</label>
            <input className="inp" inputMode="decimal" value={custoTxt} onChange={e => setCustoTxt(e.target.value)} placeholder={custoAuto != null ? txt(custoAuto) : 'digite o custo'} />
            {item && custoAuto != null && !num(custoTxt) && <p className="text-[10px] text-tinta-fraca mt-0.5">{item.fracionado ? `${brl(item.custo)}/kg × ${fator} kg` : 'custo unitário'} do Precify</p>}
          </div>
          <div>
            <label className="lbl">Peso tarifado (kg) — só ML</label>
            <input className="inp" inputMode="decimal" value={pesoTxt} onChange={e => setPesoTxt(e.target.value)} placeholder={txt(pesoKg)} />
          </div>
          <div>
            <label className="lbl">Preço de venda a testar (R$)</label>
            <input className="inp border-atencao/60 bg-atencao/5" inputMode="decimal" value={vendaTxt} onChange={e => setVendaTxt(e.target.value)} placeholder="vazio = preço ideal" />
            {precoTeste != null && <p className="text-[10px] text-tinta-fraca mt-0.5">cadastrar a {brl(precoCadastro(precoTeste, cfg))}</p>}
          </div>
          <div>
            <label className="lbl">Comissão do anúncio no ML (%)</label>
            <input className="inp" inputMode="decimal" value={comissaoTxt} onChange={e => setComissaoTxt(e.target.value)} placeholder={txt(cfg.ml.comissao * 100)} />
          </div>
          <div>
            <label className="lbl">Ads no ML (% do preço)</label>
            <input className="inp" inputMode="decimal" value={adsMlTxt} onChange={e => setAdsMlTxt(e.target.value)} placeholder={txt(cfg.ml.ads * 100)} />
          </div>
          <div>
            <label className="lbl">Ads na Shopee (% do preço)</label>
            <input className="inp" inputMode="decimal" value={adsShTxt} onChange={e => setAdsShTxt(e.target.value)} placeholder={txt(cfg.shopee.ads * 100)} />
          </div>
          <div>
            <label className="lbl">Ads no TikTok (% do preço)</label>
            <input className="inp" inputMode="decimal" value={adsTtTxt} onChange={e => setAdsTtTxt(e.target.value)} placeholder={txt(cfg.tiktok.ads * 100)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <PainelCanal canal="ml" entrada={entrada} precoTeste={precoTeste} cfg={cfg} />
        <PainelCanal canal="shopee" entrada={entrada} precoTeste={precoTeste} cfg={cfg} />
        <PainelCanal canal="tiktok" entrada={entrada} precoTeste={precoTeste} cfg={cfg} />
      </div>

      <p className="text-xs text-tinta-fraca">
        As taxas do TikTok são as que o Precify já usava (comissão de 10% e R$ 4 abaixo de R$ 50; 6% e R$ 6 acima; 6% de outras taxas) e o Ads começa em zero: confira em Parâmetros. Mercado Livre por agência ainda não está nesta calculadora. A calculadora anterior continua disponível em{' '}
        <Link href="/precificacao-multicanal" className="text-rdb-700 underline">multicanal (versão antiga)</Link>, porque os cálculos salvos nela alimentam o Farol.
      </p>
    </div>
  )
}

export default function PrecificarMarketplacesPage() {
  return (
    <Suspense fallback={<div className="text-sm text-tinta-fraca py-8">Carregando…</div>}>
      <Conteudo />
    </Suspense>
  )
}
