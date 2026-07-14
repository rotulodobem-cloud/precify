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
  const [shAuto, setShAuto] = useState(true)

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

  const selecionarVariacao = (v: VariacaoBusca) => {
    setSkuVariacaoLigado(v.skuVariacao)
    setVariacaoTxt(v.nomeVariacao)
    setCustoProduto(v.custoTotal ?? v.custoCalculado ?? 0)
    setPesoGramas(v.pesoGramas)
  }

  const limparProduto = () => {
    setProdutoSel(null); setSkuVariacaoLigado(null)
    setSku(''); setNome(''); setVariacaoTxt(''); setCustoProduto(0); setPesoGramas(null)
    setQ(''); setSugestoes([])
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

  const resultados: Record<string, ResultadoCanal | null> = {}
  CANAIS_MULTICANAL.forEach(def => {
    resultados[def.key] = modo === 'preco'
      ? calcularCanalModoPreco({ custoProduto, despVarPct, despFixPct, pesoGramas, canal: canais[def.key], def, shAuto })
      : calcularCanalModoAnalise({ custoProduto, despVarPct, despFixPct, pesoGramas, precoTeste, canal: canais[def.key], def, shAuto })
  })

  return (
    <>
      <style>{`
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
      `}</style>
      <div className="rdb">
        <div className="rdb-header">
          <div className="brand">
            <span>🍃</span>
            <div><small>Rótulo do Bem</small><strong>Central de Precificação</strong></div>
          </div>
          <h1>O preço ideal de venda em <span>cada canal</span></h1>
        </div>

        <div className="rdb-main">
          <div className="rdb-toggle">
            <button className={modo === 'preco' ? 'on' : ''} onClick={() => setModo('preco')}>Descobrir o preço ideal</button>
            <button className={modo === 'margem' ? 'on' : ''} onClick={() => setModo('margem')}>Analisar um preço</button>
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

          {/* Canais e biblioteca entram nas próximas tasks */}
        </div>
      </div>
    </>
  )
}
