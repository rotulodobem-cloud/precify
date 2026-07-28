'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { CANAIS_MULTICANAL, CanalConfig, CanalDef, ResultadoCanal, calcularCanalModoPreco, calcularCanalModoAnalise } from '@/lib/calculosMulticanal'
import { useDebounce } from '@/lib/useDebounce'

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
  const libFiltroBusca = useDebounce(libFiltro)
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

  useEffect(() => { carregarBiblioteca(libFiltroBusca) }, [libFiltroBusca, carregarBiblioteca])

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

  // Abertura via link (busca global, tela de busca): /precificacao-multicanal?skuVariacao=…
  useEffect(() => {
    const alvo = new URLSearchParams(window.location.search).get('skuVariacao')
    if (!alvo) return
    ;(async () => {
      const r = await fetch(`/api/busca?q=${encodeURIComponent(alvo)}`)
      const { results } = r.ok ? await r.json() : { results: [] }
      const produto: ProdutoBusca | undefined = results[0]
      if (!produto) return
      const variacao = produto.variacoes.find(v => v.skuVariacao === alvo)
      setProdutoSel(produto)
      setSku(produto.skuPrincipal)
      setNome(produto.nome)
      if (variacao) selecionarVariacao(variacao)
      else setCustoProduto(produto.custoAtualizado ?? 0)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      <div className="rdb">
        <div className="rdb-header">
          <div className="brand">
            <span>🍃</span>
            <div><small>Rótulo do Bem</small><strong>Central de Precificação</strong></div>
          </div>
          <h1>O preço ideal de venda em <span>cada canal</span></h1>
          <a href="/precos-praticados" className="inline-block mt-2.5 text-[11.5px] text-limao underline">
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
