'use client'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, Settings2, X, ChevronDown, Megaphone } from 'lucide-react'
import { Spinner, Alert } from '@/components/ui'
import {
  CONFIG_MKT_PADRAO, CAMPOS_CONFIG_MKT, resultado, precoParaMargem, precoCadastro, planoAds,
  lerCampo, gravarCampo, type ConfigMkt, type Canal, type Semaforo, type EntradaMkt,
} from '@/lib/precificacaoMkt'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const pct = (v?: number | null, casas = 1) => v != null ? `${(v * 100).toFixed(casas).replace('.', ',')}%` : '—'
const num = (s: string) => { const v = parseFloat(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : null }
const txt = (v: number) => String(+v.toFixed(2)).replace('.', ',')
const dec = (v: number, casas = 1) => v.toFixed(casas).replace('.', ',')
/** Shopee não deixa verba diária abaixo de R$ 10 */
const VERBA_MINIMA = 10

interface Item { sku: string; nome: string; fracionado: boolean; custo: number | null; curva: string; receitaMkt90d: number }

const GRAMATURAS = [{ r: '100 g', f: 0.1 }, { r: '250 g', f: 0.25 }, { r: '500 g', f: 0.5 }, { r: '1 kg', f: 1 }]
const COR: Record<Semaforo, string> = {
  VERDE: 'bg-ok/10 text-ok border-ok/30', AMARELO: 'bg-atencao/10 text-atencao border-atencao/30', VERMELHO: 'bg-perigo/10 text-perigo border-perigo/30',
}
const COR_TXT: Record<Semaforo, string> = { VERDE: 'text-ok', AMARELO: 'text-atencao', VERMELHO: 'text-perigo' }
const NOME: Record<Canal, string> = { ml: 'Mercado Livre Full Super', shopee: 'Shopee', tiktok: 'TikTok Shop' }

const SITUACAO: Record<Semaforo, string> = { VERDE: 'Margem boa', AMARELO: 'Margem apertada', VERMELHO: 'Abaixo do mínimo' }

function Passo({ n, titulo, children, tom = 'neutro' }: { n: number; titulo: string; children: React.ReactNode; tom?: 'neutro' | 'verde' | 'vermelho' | 'destaque' }) {
  const cls = {
    neutro: 'border-rdb-100 bg-white', destaque: 'border-rdb-300 bg-rdb-50',
    verde: 'border-ok/40 bg-ok/5', vermelho: 'border-perigo/40 bg-perigo/5',
  }[tom]
  const bola = { neutro: 'bg-rdb-700', destaque: 'bg-rdb-700', verde: 'bg-ok', vermelho: 'bg-perigo' }[tom]
  return (
    <div className={`rounded-xl border-2 p-3 ${cls}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0 ${bola}`}>{n}</span>
        <span className="text-xs font-semibold text-tinta">{titulo}</span>
      </div>
      {children}
    </div>
  )
}

function PainelCanal({ canal, entrada, precoTeste, cfg, unidades, vendasDia }: { canal: Canal; entrada: EntradaMkt | null; precoTeste: number | null; cfg: ConfigMkt; unidades: number; vendasDia: number | null }) {
  const [abrir, setAbrir] = useState(false)
  if (!entrada) {
    return <div className="card p-6 text-sm text-tinta-fraca text-center"><h2 className="section-title mb-2 text-tinta">{NOME[canal]}</h2>Informe o custo do item para calcular.</div>
  }
  const ideal = precoParaMargem(canal, cfg.meta, entrada, cfg)
  const piso = precoParaMargem(canal, cfg.piso, entrada, cfg)
  const testando = precoTeste != null
  const preco = precoTeste ?? ideal.preco
  const r = preco != null ? resultado(canal, preco, entrada, cfg) : null
  const ads = r ? planoAds(canal, r, cfg) : null

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-rdb-100 flex items-center justify-between">
        <h2 className="section-title">{NOME[canal]}</h2>
        {r && <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 ${COR[r.semaforo]}`}>{SITUACAO[r.semaforo]}</span>}
      </div>

      {!r || !ads ? (
        <p className="p-6 text-sm text-perigo">Com essas taxas não existe preço que entregue a meta de {pct(cfg.meta, 0)}: comissão, imposto e margem somam mais que o preço. Revise a meta em Parâmetros.</p>
      ) : (
        <>
          <div className="p-4 space-y-2.5">
            {testando && (
              <p className="text-[11px] text-atencao bg-atencao/5 border border-atencao/30 rounded-lg px-2.5 py-1.5">
                Você está testando o preço de {brl(r.preco)}. Para ver o preço recomendado, apague o campo "Preço promocional a testar".
              </p>
            )}

            <Passo n={1} titulo="Cadastre o anúncio por este preço" tom="destaque">
              <div className="text-3xl font-bold font-titulo tabular-nums text-rdb-700 leading-tight">{brl(precoCadastro(r.preco, cfg))}</div>
              <div className="text-[11px] text-tinta-fraca mt-0.5">é o preço cheio, antes da promoção</div>
            </Passo>

            <Passo n={2} titulo={`Crie a promoção de ${pct(cfg.descontoPromocao, 0)}`}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs text-tinta-fraca">o cliente paga</span>
                <span className="text-2xl font-bold font-titulo tabular-nums text-tinta leading-tight">{brl(r.preco)}</span>
              </div>
              <div className="text-[11px] text-tinta-fraca mt-1">
                Sobram <strong className={COR_TXT[r.semaforo]}>{brl(r.margem)} ({pct(r.margemPct)})</strong> por venda, sem contar Ads.
                {unidades > 1 && <> No kit de {unidades}, sai a {brl(r.preco / unidades)} por unidade.</>}
              </div>
            </Passo>

            {ads.cabe && ads.metaConfigurar != null ? (
              <Passo n={3} titulo={canal === 'ml' ? 'Ads: pode entrar em campanha' : 'Ads: pode anunciar'} tom="verde">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-tinta-fraca">{canal === 'ml' ? 'ROAS objetivo da campanha' : 'Meta de ROAS para digitar'}</div>
                    <div className="text-3xl font-bold font-titulo tabular-nums text-ok leading-tight">{dec(ads.metaConfigurar)}{canal === 'ml' && <span className="text-sm font-semibold"> ou mais</span>}</div>
                  </div>
                  {canal !== 'ml' && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wide text-tinta-fraca">{vendasDia ? 'Verba diária' : 'Gasto de Ads'}</div>
                      <div className="text-xl font-bold font-titulo tabular-nums text-tinta leading-tight">
                        {vendasDia ? brl(Math.max(VERBA_MINIMA, ads.adsPorVenda * vendasDia)) : <>até {brl(ads.adsPorVenda)}</>}
                      </div>
                      <div className="text-[10px] text-tinta-fraca">{vendasDia ? `${brl(ads.adsPorVenda)} por venda × ${dec(vendasDia, vendasDia % 1 ? 1 : 0)} venda(s) por dia` : 'por venda'}</div>
                    </div>
                  )}
                </div>
                {canal === 'ml' && (
                  <p className="text-[11px] text-tinta mt-1.5">
                    Coloque este anúncio numa campanha com ROAS objetivo de {dec(ads.metaConfigurar)} ou mais. Ele aguenta gastar até <strong>{brl(ads.adsPorVenda)}</strong> por venda. No Mercado Livre a verba é da campanha, não do anúncio.
                  </p>
                )}
                {canal !== 'ml' && vendasDia != null && ads.adsPorVenda * vendasDia < VERBA_MINIMA && (
                  <p className="text-[11px] text-tinta-fraca mt-1">A conta daria {brl(ads.adsPorVenda * vendasDia)}, mas a verba mínima é {brl(VERBA_MINIMA)}.</p>
                )}
                {canal !== 'ml' && !vendasDia && (
                  <p className="text-[11px] text-tinta-fraca mt-1">Preencha "Vendas por dia que você espera" para ver a verba diária.</p>
                )}
                <p className="text-[11px] text-tinta-fraca mt-2 pt-2 border-t border-ok/20 leading-relaxed">
                  <strong className="text-tinta">Por quê:</strong> sobram {pct(ads.sobra)} sem Ads − {pct(cfg.reservaAds, 0)} de lucro garantido = Ads até {pct(ads.adsMaximo)} do preço → ROAS real de {dec(ads.roasReal ?? 0)}
                  {Math.abs(ads.fator - 1) > 1e-9
                    ? <> → ÷ {dec(ads.fator, 2)} ({canal === 'shopee' ? 'a Shopee' : canal === 'tiktok' ? 'o TikTok' : 'o Mercado Livre'} entrega ROAS ~{Math.round((1 - ads.fator) * 100)}% abaixo da meta) = <strong className="text-tinta">{dec(ads.metaConfigurar)}</strong></>
                    : <> (aqui a meta é igual ao ROAS real)</>}.
                </p>
              </Passo>
            ) : (
              <Passo n={3} titulo="Ads: não anuncie este produto" tom="vermelho">
                <div className="text-2xl font-bold font-titulo text-perigo leading-tight">Sem Ads</div>
                <p className="text-xs text-tinta mt-1">
                  Sobram {pct(ads.sobra)} sem Ads, abaixo do mínimo de {pct(cfg.piso, 0)}. Venda no orgânico{canal === 'shopee' ? ' ou monte um kit (a taxa fixa e a embalagem são cobradas uma vez só)' : ''}.
                </p>
              </Passo>
            )}

            <div className="text-[11px] text-tinta-fraca px-1">
              {testando && ideal.preco != null && <div>Preço recomendado (margem de {pct(cfg.meta, 0)}): cadastrar <strong className="text-tinta">{brl(precoCadastro(ideal.preco, cfg))}</strong> → promocional <strong className="text-tinta">{brl(ideal.preco)}</strong>.</div>}
              {piso.preco != null
                ? <div>Não venda abaixo de <strong className="text-tinta">{brl(piso.preco)}</strong> no promocional (cadastro de {brl(precoCadastro(piso.preco, cfg))}): é o mínimo de {pct(cfg.piso, 0)}.</div>
                : <div className="text-perigo">Não existe preço que entregue o mínimo de {pct(cfg.piso, 0)} com essas taxas.</div>}
            </div>
          </div>

          <button onClick={() => setAbrir(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-rdb-700 hover:bg-rdb-50 border-t border-rdb-100">
            {abrir ? 'Esconder a conta' : 'Ver a conta: para onde vai cada real'} <ChevronDown size={13} className={abrir ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {abrir && (
            <>
              <table className="w-full border-t border-rdb-100 table-fixed">
                <colgroup><col /><col className="w-24" /><col className="w-16" /></colgroup>
                <tbody>
                  <tr className="tr-row"><td className="td font-medium whitespace-normal">Preço promocional (o cliente paga)</td><td className="td-r font-semibold">{brl(r.preco)}</td><td className="td-r text-xs text-tinta-fraca">100%</td></tr>
                  {r.linhas.filter(l => l.rotulo !== 'Ads').map(l => (
                    <tr key={l.rotulo} className="tr-row">
                      <td className="td text-tinta-fraca whitespace-normal">− {l.rotulo}</td>
                      <td className="td-r">{brl(l.valor)}</td>
                      <td className="td-r text-xs text-tinta-fraca">{pct(l.valor / r.preco)}</td>
                    </tr>
                  ))}
                  <tr><td className="td font-semibold whitespace-normal">Margem sem Ads</td><td className={`td-r font-bold ${COR_TXT[r.semaforo]}`}>{brl(r.margem)}</td><td className={`td-r text-xs font-semibold ${COR_TXT[r.semaforo]}`}>{pct(r.margemPct)}</td></tr>
                </tbody>
              </table>
              <div className="overflow-auto border-t border-rdb-100">
                <div className="px-4 pt-3 text-[11px] font-semibold text-tinta">Como o preço recomendado foi achado, por faixa de preço</div>
                <table className="w-full">
                  <thead className="tbl-head"><tr>
                    <th className="th">Faixa de preço</th><th className="th-r">{canal === 'ml' ? 'Envio' : 'Taxa fixa'}</th>
                    <th className="th-r">Preço p/ meta</th><th className="th-r">Válido</th><th className="th-r">Preço p/ mínimo</th><th className="th-r">Válido</th>
                  </tr></thead>
                  <tbody>
                    {ideal.faixas.map((fx, i) => (
                      <tr key={fx.de} className="tr-row">
                        <td className="td text-xs">{brl(fx.de)} {fx.ate != null ? `a ${brl(fx.ate)}` : 'ou mais'}</td>
                        <td className="td-r text-xs">{brl(fx.custoFaixa)}</td>
                        <td className="td-r text-xs text-tinta-fraca">{brl(fx.preco)}</td>
                        <td className={`td-r text-xs ${fx.valido != null && fx.valido === ideal.preco ? 'font-bold text-rdb-700' : ''}`}>{fx.valido != null ? brl(fx.valido) : '—'}</td>
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
            </>
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
  const [unidades, setUnidades] = useState(1)
  const [vendasDiaTxt, setVendasDiaTxt] = useState('')
  const [entrega, setEntrega] = useState<'media' | 'padrao' | 'direta'>('media')
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
  // kit: o anúncio leva N unidades, então custo e peso multiplicam; taxas fixas e por pedido não
  const custoAuto = item?.custo != null ? item.custo * f * unidades : null
  const custo = num(custoTxt) ?? custoAuto
  const pesoKg = num(pesoTxt) ?? (item ? (item.fracionado ? fator : 0.3) * unidades : unidades)
  const precoTeste = num(vendaTxt)
  const vendasDia = num(vendasDiaTxt) || null
  const entrada: EntradaMkt | null = custo != null && custo > 0 ? {
    custo, pesoKg,
    comissaoML: num(comissaoTxt) != null ? num(comissaoTxt)! / 100 : undefined,
    // a conta é sempre SEM Ads; o quanto de Ads cabe aparece no fim de cada canal
    adsML: 0, adsShopee: 0, adsTiktok: 0,
    entregaShopee: entrega,
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
          <strong>Como usar:</strong> escolha o produto e siga os três passos de cada canal. <strong>1</strong> — cadastre o anúncio pelo preço cheio. <strong>2</strong> — crie a promoção de {pct(cfg.descontoPromocao, 0)}; o cliente paga o preço promocional.{' '}
          <strong>3</strong> — veja se o produto pode ter Ads e qual meta de ROAS colocar. As taxas e a margem são calculadas sem Ads. No fim de cada canal aparece se o produto pode ter Ads, qual meta de ROAS colocar e por quê.
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
                    <label className="lbl">{c.rotulo}{c.tipo !== 'num' && ` (${c.tipo === 'pct' ? '%' : 'R$'})`}</label>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 items-start">
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
            <label className="lbl">Unidades no anúncio (kit)</label>
            <div className="flex gap-1">
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => { setUnidades(n); setCustoTxt(''); setPesoTxt('') }}
                  className={`flex-1 text-xs rounded-lg border px-1 py-2 ${unidades === n ? 'bg-rdb-700 text-white border-rdb-700' : 'bg-white border-rdb-200 text-tinta hover:bg-rdb-50'}`}>{n === 1 ? '1 un.' : `kit ${n}`}</button>
              ))}
              <input className="inp-sm w-14 text-center" type="number" min={1} max={50} value={unidades} title="Outra quantidade"
                onChange={e => { const v = Math.floor(Number(e.target.value)); if (v >= 1 && v <= 50) { setUnidades(v); setCustoTxt(''); setPesoTxt('') } }} />
            </div>
          </div>
          <div>
            <label className="lbl">Custo do item anunciado (R$)</label>
            <input className="inp" inputMode="decimal" value={custoTxt} onChange={e => setCustoTxt(e.target.value)} placeholder={custoAuto != null ? txt(custoAuto) : 'digite o custo'} />
            {item && custoAuto != null && !num(custoTxt) && <p className="text-[10px] text-tinta-fraca mt-0.5">{item.fracionado ? `${brl(item.custo)}/kg × ${fator} kg` : 'custo unitário'}{unidades > 1 ? ` × ${unidades} un.` : ''} do Precify</p>}
            {!item && unidades > 1 && <p className="text-[10px] text-tinta-fraca mt-0.5">informe o custo do kit inteiro ({unidades} unidades)</p>}
          </div>
          <div>
            <label className="lbl">Peso tarifado (kg) — só ML</label>
            <input className="inp" inputMode="decimal" value={pesoTxt} onChange={e => setPesoTxt(e.target.value)} placeholder={txt(pesoKg)} />
          </div>
          <div>
            <label className="lbl">Preço promocional a testar (R$)</label>
            <input className="inp border-atencao/60 bg-atencao/5" inputMode="decimal" value={vendaTxt} onChange={e => setVendaTxt(e.target.value)} placeholder="vazio = preço ideal" />
            <p className="text-[10px] text-tinta-fraca mt-0.5">preço promocional, o que o cliente paga</p>
          </div>
          <div>
            <label className="lbl">Comissão do anúncio no ML (%)</label>
            <input className="inp" inputMode="decimal" value={comissaoTxt} onChange={e => setComissaoTxt(e.target.value)} placeholder={txt(cfg.ml.comissao * 100)} />
          </div>
          <div>
            <label className="lbl">Vendas por dia que você espera</label>
            <input className="inp" inputMode="decimal" value={vendasDiaTxt} onChange={e => setVendasDiaTxt(e.target.value)} placeholder="ex.: 3 (para a verba da Shopee)" />
          </div>
          <div>
            <label className="lbl">Entrega na Shopee</label>
            <select className="inp" value={entrega} onChange={e => setEntrega(e.target.value as 'media' | 'padrao' | 'direta')}>
              <option value="media">Média dos pedidos ({brl(cfg.shopee.frete)})</option>
              <option value="padrao">Entrega Padrão — sem custo</option>
              <option value="direta">Entrega Direta — motoboy ({brl(cfg.shopee.freteDireta)})</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <PainelCanal canal="ml" entrada={entrada} precoTeste={precoTeste} cfg={cfg} unidades={unidades} vendasDia={vendasDia} />
        <PainelCanal canal="shopee" entrada={entrada} precoTeste={precoTeste} cfg={cfg} unidades={unidades} vendasDia={vendasDia} />
        <PainelCanal canal="tiktok" entrada={entrada} precoTeste={precoTeste} cfg={cfg} unidades={unidades} vendasDia={vendasDia} />
      </div>

      <p className="text-xs text-tinta-fraca">
        As taxas do TikTok são as que o Precify já usava (comissão de 10% e R$ 4 abaixo de R$ 50; 6% e R$ 6 acima; 6% de outras taxas) confira em Parâmetros. Mercado Livre por agência ainda não está nesta calculadora. A calculadora anterior continua disponível em{' '}
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
