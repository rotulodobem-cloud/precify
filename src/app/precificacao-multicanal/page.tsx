'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { CANAIS_MULTICANAL, CanalConfig, CanalDef, ResultadoCanal, calcularCanalModoPreco, calcularCanalModoAnalise } from '@/lib/calculosMulticanal'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pctf = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

interface VariacaoBusca { skuVariacao: string; nomeVariacao: string; pesoGramas: number | null; custoTotal: number | null; custoCalculado: number | null }
interface ProdutoBusca { skuPrincipal: string; nome: string; custoAtualizado: number | null; variacoes: VariacaoBusca[] }

type CanaisState = Record<string, CanalConfig>

function canaisIniciais(): CanaisState {
  const s: CanaisState = {}
  CANAIS_MULTICANAL.forEach(c => { s[c.key] = { ...c.default } })
  return s
}

export default function PrecificacaoMulticanalPage() {
  const [modo, setModo] = useState<'preco' | 'margem'>('preco')

  // Dados do produto
  const [sku, setSku] = useState('')
  const [nome, setNome] = useState('')
  const [variacaoTxt, setVariacaoTxt] = useState('')
  const [skuVariacaoLigado, setSkuVariacaoLigado] = useState<string | null>(null)
  const [custoProduto, setCustoProduto] = useState(0)
  const [pesoGramas, setPesoGramas] = useState<number | null>(null)
  const [despVarPct, setDespVarPct] = useState(8)
  const [despFixPct, setDespFixPct] = useState(0)
  const [margemPadrao, setMargemPadrao] = useState(25)
  const [precoTeste, setPrecoTeste] = useState(0)

  // Busca de produto
  const [q, setQ] = useState('')
  const [sugestoes, setSugestoes] = useState<ProdutoBusca[]>([])
  const [produtoSel, setProdutoSel] = useState<ProdutoBusca | null>(null)
  const [buscando, setBuscando] = useState(false)
  const buscaTimer = useRef<NodeJS.Timeout>()

  // Canais
  const [canais, setCanais] = useState<CanaisState>(canaisIniciais())
  const [autoStates, setAutoStates] = useState<Record<string, boolean>>({ sh: true, tt: true })
  const [canaisAtivos, setCanaisAtivos] = useState<Record<string, boolean>>({})

  // Biblioteca
  const [biblioteca, setBiblioteca] = useState<any[]>([])
  const [libFiltro, setLibFiltro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msgSalvo, setMsgSalvo] = useState('')

  // Preço praticado (Loja Própria) e tolerância
  const [precoPraticadoLP, setPrecoPraticadoLP] = useState<number | null>(null)
  const [tolerancia, setTolerancia] = useState(10)

  useEffect(() => {
    fetch('/api/configuracao/tolerancia-loja-propria').then(r => r.json()).then(d => setTolerancia(d.valor))
  }, [])

  const salvarTolerancia = async (novoValor: number) => {
    setTolerancia(novoValor)
    await fetch('/api/configuracao/tolerancia-loja-propria', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: novoValor }),
    })
  }

  const carregarBiblioteca = useCallback(async (filtro: string) => {
    const params = new URLSearchParams()
    if (filtro) params.set('q', filtro)
    const r = await fetch('/api/calculo-multicanal?' + params)
    setBiblioteca(r.ok ? await r.json() : [])
  }, [])

  useEffect(() => { carregarBiblioteca(libFiltro) }, [libFiltro, carregarBiblioteca])

  const buscarProduto = useCallback((valor: string) => {
    setQ(valor)
    clearTimeout(buscaTimer.current)
    if (valor.length < 2) { setSugestoes([]); return }
    setBuscando(true)
    buscaTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/busca?q=${encodeURIComponent(valor)}`)
      const { results } = r.ok ? await r.json() : { results: [] }
      setBuscando(false)
      if (results.length === 1) { selecionarProduto(results[0]); return }
      setSugestoes(results)
    }, 400)
  }, [])

  const selecionarProduto = (p: ProdutoBusca) => {
    setProdutoSel(p)
    setSugestoes([])
    setSku(p.skuPrincipal)
    setNome(p.nome)
    setQ('')
    if (p.variacoes.length === 1) selecionarVariacao(p.variacoes[0])
    else { setCustoProduto(p.custoAtualizado ?? 0); setSkuVariacaoLigado(null); setPesoGramas(null); setVariacaoTxt('') }
  }

  const aplicarCalculoSalvo = (item: any) => {
    setSku(item.sku); setNome(item.nome); setVariacaoTxt(item.variacao || '')
    setSkuVariacaoLigado(item.skuVariacao); setCustoProduto(item.custoProduto); setPesoGramas(item.pesoGramas)
    setDespVarPct(item.despesasVariaveisPct); setDespFixPct(item.despesasFixasPct)
    setModo(item.modo === 'margem' ? 'margem' : 'preco'); setPrecoTeste(item.precoTeste || 0)
    const canaisCompletos: CanaisState = {}
    CANAIS_MULTICANAL.forEach(d => { canaisCompletos[d.key] = item.canais?.[d.key] ?? d.default })
    setCanais(canaisCompletos)
    setCanaisAtivos(item.canaisAtivos ?? {})
    setPrecoPraticadoLP(item.precoPraticadoLP ?? null)
  }

  const selecionarVariacao = async (v: VariacaoBusca) => {
    setSkuVariacaoLigado(v.skuVariacao)
    setVariacaoTxt(v.nomeVariacao)
    setCustoProduto(v.custoTotal ?? v.custoCalculado ?? 0)
    setPesoGramas(v.pesoGramas)
    setCanaisAtivos({})
    setPrecoPraticadoLP(null)

    const r = await fetch(`/api/calculo-multicanal?skuVariacao=${encodeURIComponent(v.skuVariacao)}`)
    if (r.ok) {
      const calculoSalvo = await r.json()
      if (calculoSalvo) aplicarCalculoSalvo(calculoSalvo)
    }
  }

  const limparProduto = () => {
    setProdutoSel(null); setSkuVariacaoLigado(null)
    setSku(''); setNome(''); setVariacaoTxt(''); setCustoProduto(0); setPesoGramas(null)
    setQ(''); setSugestoes([])
    setCanaisAtivos({})
    setPrecoPraticadoLP(null)
  }

  const setCanalField = (key: string, field: keyof CanalConfig, valor: number) => {
    setCanais(prev => ({ ...prev, [key]: { ...prev[key], [field]: valor } }))
  }

  const aplicarMargemTodos = () => {
    setCanais(prev => {
      const n = { ...prev }
      CANAIS_MULTICANAL.forEach(c => { n[c.key] = { ...n[c.key], margem: margemPadrao } })
      return n
    })
  }

  const salvarCalculo = async () => {
    if (!sku.trim() && !nome.trim()) { setMsgSalvo('Informe o SKU ou o nome do produto.'); return }
    setSalvando(true)
    const r = await fetch('/api/calculo-multicanal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku, nome, variacao: variacaoTxt, skuVariacao: skuVariacaoLigado,
        custoProduto, pesoGramas, despesasVariaveisPct: despVarPct, despesasFixasPct: despFixPct,
        modo, precoTeste, canais, canaisAtivos, precoPraticadoLP,
      }),
    })
    setSalvando(false)
    if (!r.ok) { const d = await r.json(); setMsgSalvo(d.error ?? 'Erro ao salvar'); return }
    setMsgSalvo('Cálculo salvo na biblioteca.')
    carregarBiblioteca(libFiltro)
    setTimeout(() => setMsgSalvo(''), 3000)
  }

  const carregarDaLib = (item: any) => {
    aplicarCalculoSalvo(item)
    setProdutoSel(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const excluirDaLib = async (item: any) => {
    if (!confirm(`Excluir ${item.sku || item.nome}${item.variacao ? ' (' + item.variacao + ')' : ''}?`)) return
    await fetch(`/api/calculo-multicanal/${item.id}`, { method: 'DELETE' })
    carregarBiblioteca(libFiltro)
  }

  const calcularPrecosLib = (item: any): Record<string, number | null> => {
    const out: Record<string, number | null> = {}
    CANAIS_MULTICANAL.forEach(def => {
      const r = calcularCanalModoPreco({
        custoProduto: item.custoProduto, despVarPct: item.despesasVariaveisPct, despFixPct: item.despesasFixasPct,
        pesoGramas: item.pesoGramas, canal: item.canais?.[def.key] ?? def.default, def, shAuto: true,
      })
      out[def.key] = r ? r.preco : null
    })
    return out
  }

  const resultados: Record<string, ResultadoCanal | null> = {}
  CANAIS_MULTICANAL.forEach(def => {
    const shAuto = autoStates[def.key] ?? true
    resultados[def.key] = modo === 'preco'
      ? calcularCanalModoPreco({ custoProduto, despVarPct, despFixPct, pesoGramas, canal: canais[def.key], def, shAuto })
      : calcularCanalModoAnalise({ custoProduto, despVarPct, despFixPct, pesoGramas, precoTeste, canal: canais[def.key], def, shAuto })
  })

  const resultadoLP = resultados.lp
  const desvioLP = (precoPraticadoLP && precoPraticadoLP > 0 && resultadoLP)
    ? (resultadoLP.preco - precoPraticadoLP) / precoPraticadoLP
    : null
  const desvioLPForaTolerancia = desvioLP != null && Math.abs(desvioLP) * 100 > tolerancia

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .rdb { font-family: 'Montserrat', system-ui, sans-serif; background: #F4F7EF; color: #16241C; margin: -24px; padding: 0 0 40px; min-height: 100vh; }
        .rdb h1, .rdb h2, .rdb h3 { font-family: 'Poppins', sans-serif; }
        .rdb-header { background: #055E2B; color: #fff; padding: 26px 24px 30px; }
        .rdb-header .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .rdb-header .brand strong { font-family: 'Poppins'; font-weight: 600; font-size: 15px; }
        .rdb-header .brand small { display: block; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #CDDE35; font-weight: 600; }
        .rdb-header h1 { font-size: 22px; font-weight: 700; }
        .rdb-header h1 span { color: #CDDE35; }
        .rdb-main { max-width: 1180px; margin: 0 auto; padding: 0 20px; }
        .rdb-toggle { display: flex; gap: 6px; background: #fff; border: 1px solid #DDE7D4; border-radius: 14px; padding: 6px; margin: -20px auto 20px; max-width: 560px; box-shadow: 0 8px 24px rgba(4,43,20,.06); }
        .rdb-toggle button { flex: 1; border: none; background: transparent; padding: 12px 10px; border-radius: 9px; cursor: pointer; font-family: 'Poppins'; font-weight: 600; font-size: 13px; color: #5C6B60; }
        .rdb-toggle button.on { background: #055E2B; color: #fff; }
        .rdb-tol { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: #5C6B60; margin: -8px auto 20px; }
        .rdb-tol input { width: 56px; font-family: 'Poppins'; font-weight: 600; font-size: 13px; border: 1.5px solid #DDE7D4; border-radius: 8px; padding: 6px 8px; text-align: center; background: #fff; }
        .rdb-lp-praticado { margin: 10px 14px 0; }
        .rdb-lp-selo { display: inline-block; margin-top: 6px; }
        .rdb-card { background: #fff; border: 1px solid #DDE7D4; border-radius: 16px; box-shadow: 0 8px 24px rgba(4,43,20,.06); padding: 16px 20px; margin-bottom: 18px; }
        .rdb-card h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
        .rdb-field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px; }
        .rdb-field input { width: 100%; font-family: 'Poppins'; font-weight: 500; font-size: 14px; color: #16241C; border: 1.5px solid #DDE7D4; border-radius: 10px; padding: 9px 11px; background: #FCFDFB; }
        .rdb-field input:focus { outline: none; border-color: #055E2B; box-shadow: 0 0 0 3px rgba(5,94,43,.13); }
        .rdb-grid3 { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 12px; margin-bottom: 14px; }
        .rdb-grid-metas { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 12px; }
        .rdb-sugestoes { border: 1px solid #DDE7D4; border-radius: 10px; margin-top: 4px; overflow: hidden; }
        .rdb-sugestoes button { display: block; width: 100%; text-align: left; padding: 8px 12px; background: #fff; border: none; border-bottom: 1px solid #EEF2E9; cursor: pointer; font-size: 13px; }
        .rdb-sugestoes button:hover { background: #F7FAF3; }
        .rdb-chans { display: grid; grid-template-columns: repeat(auto-fit,minmax(270px,1fr)); gap: 16px; margin-top: 4px; }
        .rdb-chan { background: #fff; border: 1px solid #DDE7D4; border-radius: 16px; box-shadow: 0 8px 24px rgba(4,43,20,.06); overflow: hidden; }
        .rdb-chan-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 0; }
        .rdb-chan-ic { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-family: 'Poppins'; font-weight: 700; font-size: 11px; }
        .rdb-chan-nome { font-family: 'Poppins'; font-weight: 600; font-size: 13px; line-height: 1.15; }
        .rdb-chan-nome span { display: block; font-family: 'Montserrat'; font-weight: 600; font-size: 10px; color: #5C6B60; }
        .rdb-price { margin: 10px 14px; background: #055E2B; color: #fff; border-radius: 12px; padding: 13px 15px; }
        .rdb-price.neg { background: #C0392B; }
        .rdb-price .lb { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #CDDE35; font-weight: 700; }
        .rdb-price.neg .lb { color: #fff; opacity: .85; }
        .rdb-price .big { font-family: 'Poppins'; font-weight: 700; font-size: 28px; margin-top: 2px; }
        .rdb-price .sub { font-size: 11.5px; color: #DCEAD9; margin-top: 2px; }
        .rdb-price.neg .sub { color: #fff; }
        .rdb-promo { margin: 0 14px 10px; background: #F7FAF3; border: 1px solid #DDE7D4; border-radius: 10px; padding: 9px 12px; }
        .rdb-promo .lb { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: #5C6B60; font-weight: 700; }
        .rdb-promo .val { font-family: 'Poppins'; font-weight: 700; font-size: 16px; color: #055E2B; margin-top: 1px; }
        .rdb-promo .sub { font-size: 10.5px; color: #5C6B60; margin-top: 2px; }
        .rdb-fees { padding: 10px 14px 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-top: 1px solid #DDE7D4; margin-top: 4px; }
        .rdb-fees .rdb-field { margin: 0; }
        .rdb-fees .rdb-field label { font-size: 10.5px; }
        .rdb-fees input { font-size: 12.5px; padding: 7px 9px; }
        .rdb-autobox { grid-column: 1/-1; display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; background: #F7FAF3; border: 1px solid #DDE7D4; border-radius: 9px; padding: 7px 9px; cursor: pointer; }
        .rdb-selo { margin-left: auto; font-size: 9.5px; font-weight: 700; padding: 3px 7px; border-radius: 20px; background: #055E2B; color: #CDDE35; }
        .rdb-selo.err { background: #FBE6E3; color: #C0392B; }
        .rdb-lib-ctrls { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
        .rdb-lib-ctrls input { padding: 8px 12px; font-size: 13px; border: 1.5px solid #DDE7D4; border-radius: 10px; min-width: 200px; }
        .rdb-btn { font-family: 'Poppins'; font-weight: 600; font-size: 12.5px; border-radius: 10px; padding: 9px 14px; cursor: pointer; border: 1.5px solid #DDE7D4; background: #fff; }
        .rdb-btn.prim { background: #055E2B; border-color: #055E2B; color: #fff; }
        .rdb-libtbl { width: 100%; border-collapse: collapse; font-size: 12px; }
        .rdb-libtbl th { text-align: left; font-size: 10px; text-transform: uppercase; color: #5C6B60; padding: 8px 10px; background: #F7FAF3; border-bottom: 1px solid #DDE7D4; }
        .rdb-libtbl th.r, .rdb-libtbl td.r { text-align: right; }
        .rdb-libtbl td { padding: 8px 10px; border-bottom: 1px solid #EEF2E9; }
        .rdb-iact { border: 1.5px solid #DDE7D4; background: #fff; border-radius: 8px; padding: 4px 8px; font-size: 11px; cursor: pointer; margin-left: 4px; }
      ` }} />
      <div className="rdb">
        <div className="rdb-header">
          <div className="brand">
            <span>🍃</span>
            <div><small>Rótulo do Bem</small><strong>Central de Precificação</strong></div>
          </div>
          <h1>O preço ideal de venda em <span>cada canal</span></h1>
          <a href="/precos-praticados" style={{ display: 'inline-block', marginTop: 10, fontSize: 11.5, color: '#CDDE35', textDecoration: 'underline' }}>
            Importar preços praticados em massa (Loja Própria) →
          </a>
        </div>

        <div className="rdb-main">
          <div className="rdb-toggle">
            <button className={modo === 'preco' ? 'on' : ''} onClick={() => setModo('preco')}>Descobrir o preço ideal</button>
            <button className={modo === 'margem' ? 'on' : ''} onClick={() => setModo('margem')}>Analisar um preço</button>
          </div>

          <div className="rdb-tol">
            <span>Tolerância de preço (Loja Própria):</span>
            <input type="number" step="1" min="0" value={tolerancia}
              onChange={e => setTolerancia(parseFloat(e.target.value) || 0)}
              onBlur={e => salvarTolerancia(parseFloat(e.target.value) || 0)} />
            <span>%</span>
          </div>

          <section className="rdb-card">
            <h2>Dados do produto</h2>
            <div className="rdb-grid3">
              <div className="rdb-field">
                <label>SKU / nome</label>
                <input value={q || sku} onChange={e => { buscarProduto(e.target.value); setSku(e.target.value) }}
                  placeholder="Digite o SKU ou nome…" />
                {sugestoes.length > 0 && (
                  <div className="rdb-sugestoes">
                    {sugestoes.map(p => (
                      <button key={p.skuPrincipal} onClick={() => selecionarProduto(p)}>{p.nome} — {p.skuPrincipal}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="rdb-field"><label>Nome do produto</label>
                <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Cúrcuma em pó" /></div>
              <div className="rdb-field"><label>Variação</label>
                <input value={variacaoTxt} onChange={e => setVariacaoTxt(e.target.value)} placeholder="ex: 250g" /></div>
            </div>

            {produtoSel && produtoSel.variacoes.length > 1 && (
              <div className="rdb-sugestoes" style={{ marginBottom: 14 }}>
                {produtoSel.variacoes.map(v => (
                  <button key={v.skuVariacao} onClick={() => selecionarVariacao(v)}>
                    {v.nomeVariacao} {skuVariacaoLigado === v.skuVariacao ? '✓' : ''}
                  </button>
                ))}
              </div>
            )}
            {produtoSel && (
              <button onClick={limparProduto} style={{ marginBottom: 14, fontSize: 12, color: '#5C6B60', background: 'none', border: 'none', cursor: 'pointer' }}>
                Limpar produto selecionado
              </button>
            )}

            <div className="rdb-grid-metas">
              <div className="rdb-field"><label>Custo do produto (R$)</label>
                <input type="number" step="0.01" value={custoProduto} onChange={e => setCustoProduto(parseFloat(e.target.value) || 0)} /></div>
              <div className="rdb-field"><label>Peso (g) — necessário pro ML Full</label>
                <input type="number" step="1" value={pesoGramas ?? ''} onChange={e => setPesoGramas(e.target.value ? parseFloat(e.target.value) : null)} /></div>
              <div className="rdb-field"><label>Despesas variáveis gerais (%)</label>
                <input type="number" step="0.1" value={despVarPct} onChange={e => setDespVarPct(parseFloat(e.target.value) || 0)} /></div>
              <div className="rdb-field"><label>Despesas fixas rateio (%)</label>
                <input type="number" step="0.1" value={despFixPct} onChange={e => setDespFixPct(parseFloat(e.target.value) || 0)} /></div>
              {modo === 'preco' ? (
                <div className="rdb-field">
                  <label>Margem padrão (%)</label>
                  <input type="number" step="1" value={margemPadrao} onChange={e => setMargemPadrao(parseFloat(e.target.value) || 0)} />
                  <button type="button" onClick={aplicarMargemTodos} style={{ marginTop: 6, width: '100%', fontSize: 12, padding: '6px 10px', border: '1.5px solid #DDE7D4', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>
                    Aplicar a todos os canais
                  </button>
                </div>
              ) : (
                <div className="rdb-field"><label>Preço a testar (R$)</label>
                  <input type="number" step="0.01" value={precoTeste} onChange={e => setPrecoTeste(parseFloat(e.target.value) || 0)} /></div>
              )}
            </div>
          </section>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '-4px 0 18px' }}>
            <button className="rdb-btn prim" onClick={salvarCalculo} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar cálculo'}
            </button>
            {msgSalvo && <span style={{ fontSize: 12.5, color: '#5C6B60' }}>{msgSalvo}</span>}
          </div>

          <div className="rdb-chans">
            {CANAIS_MULTICANAL.map(def => {
              const r = resultados[def.key]
              const cfg = canais[def.key]
              return (
                <div key={def.key} className="rdb-chan">
                  <div className="rdb-chan-head">
                    <span className="rdb-chan-ic" style={{ background: def.cor, color: def.corTexto }}>
                      {def.nome.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="rdb-chan-nome">{def.nome}<span>{def.tag}</span></span>
                    {def.key !== 'lp' && !canaisAtivos[def.key] && <span className="rdb-selo" style={{ background: '#EEF2E9', color: '#5C6B60' }}>sem anúncio</span>}
                    {r && r.lucro < 0 && <span className="rdb-selo err">prejuízo</span>}
                  </div>

                  {def.key === 'lp' && (
                    <div className="rdb-lp-praticado">
                      <div className="rdb-field">
                        <label>Preço praticado hoje (R$)</label>
                        <input type="number" step="0.01" value={precoPraticadoLP ?? ''}
                          onChange={e => setPrecoPraticadoLP(e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder="ex: 24.90" />
                      </div>
                      {desvioLPForaTolerancia && (
                        <span className="rdb-selo err rdb-lp-selo">
                          preço calculado {desvioLP! > 0 ? 'subiu' : 'baixou'} {pctf(Math.abs(desvioLP!) * 100)} vs. praticado
                        </span>
                      )}
                    </div>
                  )}

                  {def.key !== 'lp' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#5C6B60', padding: '6px 14px 0' }}>
                      <input type="checkbox" checked={canaisAtivos[def.key] ?? false}
                        onChange={e => setCanaisAtivos(s => ({ ...s, [def.key]: e.target.checked }))} />
                      Anunciado nesta plataforma
                    </label>
                  )}

                  {!r ? (
                    <div className={`rdb-price neg`}>
                      <div className="lb">Preço ideal de venda</div>
                      <div className="big">—</div>
                      <div className="sub">Taxas + margem passam de 100%. Reduza a margem ou os custos.</div>
                    </div>
                  ) : (
                    <div className={`rdb-price ${r.lucro < 0 ? 'neg' : ''}`}>
                      <div className="lb">Preço ideal de venda</div>
                      <div className="big">{brl(r.preco)}</div>
                      <div className="sub">margem de {pctf(r.margem * 100)} · sobra {brl(r.lucro)}</div>
                    </div>
                  )}

                  {r && def.key !== 'lp' && (
                    <div className="rdb-promo">
                      <div className="lb">Preço p/ anunciar (+40%)</div>
                      <div className="val">{brl(r.preco * 1.4)}</div>
                      <div className="sub">suba o produto por esse valor e depois promocione até {brl(r.preco)}</div>
                    </div>
                  )}

                  <div className="rdb-fees">
                    <div className="rdb-field"><label>Margem desejada (%)</label>
                      <input type="number" step="1" value={cfg.margem}
                        onChange={e => setCanalField(def.key, 'margem', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Embalagem (R$)</label>
                      <input type="number" step="0.01" value={cfg.emb}
                        onChange={e => setCanalField(def.key, 'emb', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Comissão (%)</label>
                      <input type="number" step="0.1" value={cfg.com} disabled={def.autoBand && (autoStates[def.key] ?? true)}
                        onChange={e => setCanalField(def.key, 'com', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Outras taxas (%)</label>
                      <input type="number" step="0.1" value={cfg.out}
                        onChange={e => setCanalField(def.key, 'out', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Taxa fixa (R$)</label>
                      <input type="number" step="0.01" value={cfg.fix} disabled={def.autoBand && (autoStates[def.key] ?? true)}
                        onChange={e => setCanalField(def.key, 'fix', parseFloat(e.target.value) || 0)} /></div>
                    <div className="rdb-field"><label>Frete (R$)</label>
                      <input type="number" step="0.01" value={cfg.frete} disabled={def.freteEspecial === 'full'}
                        onChange={e => setCanalField(def.key, 'frete', parseFloat(e.target.value) || 0)} /></div>
                    {def.autoBand && (
                      <label className="rdb-autobox">
                        <input type="checkbox" checked={autoStates[def.key] ?? true}
                          onChange={e => setAutoStates(s => ({ ...s, [def.key]: e.target.checked }))} />
                        Ajustar faixa automaticamente
                      </label>
                    )}
                    {def.freteEspecial === 'full' && !pesoGramas && (
                      <div style={{ gridColumn: '1/-1', fontSize: 11, color: '#C0392B' }}>
                        Informe o peso do produto (campo acima) pra calcular o frete FULL.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <section className="rdb-card">
            <h2>Biblioteca de produtos</h2>
            <div className="rdb-lib-ctrls">
              <input placeholder="Filtrar por SKU ou nome" value={libFiltro} onChange={e => setLibFiltro(e.target.value)} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="rdb-libtbl">
                <thead>
                  <tr>
                    <th>SKU</th><th>Produto</th><th>Variação</th><th className="r">Custo</th>
                    {CANAIS_MULTICANAL.map(c => <th key={c.key} className="r">{c.nome}{c.tag === 'FULL' ? ' Full' : c.tag === 'clássico' ? ' Clássico' : ''}</th>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {biblioteca.length === 0 && (
                    <tr><td colSpan={4 + CANAIS_MULTICANAL.length + 1} style={{ textAlign: 'center', padding: 20, color: '#5C6B60' }}>
                      Nenhum cálculo salvo ainda.
                    </td></tr>
                  )}
                  {biblioteca.map(item => {
                    const precos = calcularPrecosLib(item)
                    return (
                      <tr key={item.id}>
                        <td>{item.sku || '—'}</td>
                        <td>{item.nome || '—'}</td>
                        <td>{item.variacao || '—'}</td>
                        <td className="r">{brl(item.custoProduto)}</td>
                        {CANAIS_MULTICANAL.map(c => (
                          <td key={c.key} className="r">{precos[c.key] != null ? brl(precos[c.key]!) : '—'}</td>
                        ))}
                        <td>
                          <button className="rdb-iact" onClick={() => carregarDaLib(item)}>Carregar</button>
                          <button className="rdb-iact" onClick={() => excluirDaLib(item)}>Excluir</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
