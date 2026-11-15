'use client'
import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, RotateCcw } from 'lucide-react'
import { Spinner } from '@/components/ui'

interface Fala { papel: 'voce' | 'precify'; texto: string }

const SUGESTOES = [
  'O que eu preciso comprar com mais urgência?',
  'Quanto vou gastar se fizer o pedido de todos os fornecedores?',
  'Onde tem mais dinheiro parado em estoque?',
  'Quais custos subiram nos últimos 60 dias?',
  'De quem está mais barato comprar chia?',
]

export default function PerguntaRapida() {
  const [pergunta, setPergunta] = useState('')
  const [falas, setFalas]       = useState<Fala[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro]         = useState('')
  const [configurada, setConfigurada] = useState<boolean | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/perguntar').then(r => r.json()).then(d => setConfigurada(!!d.configurada)).catch(() => setConfigurada(null))
  }, [])
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [falas, enviando])

  const perguntar = async (texto: string) => {
    const p = texto.trim()
    if (!p || enviando) return
    setErro(''); setEnviando(true); setPergunta('')
    const historico = falas
    setFalas(f => [...f, { papel: 'voce', texto: p }])
    try {
      const r = await fetch('/api/perguntar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: p, historico }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(d.error ?? `Erro ao perguntar (HTTP ${r.status}).`); setFalas(historico); setPergunta(p); return }
      setFalas(f => [...f, { papel: 'precify', texto: d.resposta }])
    } catch {
      setErro('Falha de conexão. Tente de novo.'); setFalas(historico); setPergunta(p)
    } finally { setEnviando(false) }
  }

  return (
    <div className="card p-4" id="perguntar">
      <div className="flex items-center justify-between mb-2">
        <h2 className="section-title flex items-center gap-2"><Sparkles size={14} className="text-rdb-700" /> Pergunte ao Precify</h2>
        {falas.length > 0 && (
          <button onClick={() => { setFalas([]); setErro('') }} className="text-xs text-tinta-fraca hover:text-tinta flex items-center gap-1">
            <RotateCcw size={11} /> Nova conversa
          </button>
        )}
      </div>

      {configurada === false && (
        <p className="text-xs text-atencao bg-atencao/5 border border-atencao/30 rounded-lg px-3 py-2 mb-2">
          As perguntas ainda não estão ativas: falta cadastrar a chave da IA no servidor (variável ANTHROPIC_API_KEY).
        </p>
      )}

      {falas.length > 0 && (
        <div className="space-y-2 mb-3 max-h-96 overflow-auto pr-1">
          {falas.map((f, i) => (
            <div key={i} className={f.papel === 'voce' ? 'flex justify-end' : ''}>
              <div className={`text-sm rounded-xl px-3 py-2 whitespace-pre-wrap leading-relaxed ${f.papel === 'voce' ? 'bg-rdb-700 text-white max-w-[80%]' : 'bg-rdb-50 text-tinta'}`}>
                {f.texto}
              </div>
            </div>
          ))}
          {enviando && <div className="text-sm text-tinta-fraca flex items-center gap-2 px-1"><Spinner size={13} /> Olhando estoque, vendas e compras…</div>}
          <div ref={fim} />
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); perguntar(pergunta) }} className="flex gap-2">
        <input className="inp flex-1" value={pergunta} onChange={e => setPergunta(e.target.value)} disabled={enviando}
          placeholder="Ex.: o que comprar da VALLE esta semana?" />
        <button type="submit" className="btn-primary" disabled={enviando || !pergunta.trim()}>
          {enviando && !falas.length ? <Spinner size={13} /> : <Send size={13} />} Perguntar
        </button>
      </form>
      {erro && <p className="text-xs text-perigo mt-2">{erro}</p>}

      {falas.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SUGESTOES.map(s => (
            <button key={s} onClick={() => perguntar(s)} disabled={enviando}
              className="text-xs text-rdb-800 bg-rdb-50 hover:bg-rdb-100 border border-rdb-100 rounded-full px-3 py-1 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
