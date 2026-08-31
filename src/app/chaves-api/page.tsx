'use client'
import { useState, useEffect } from 'react'
import { KeyRound, Copy, Ban, Check } from 'lucide-react'

interface ChaveApi {
  id: string
  nome: string
  chavePrefixo: string
  ativa: boolean
  ultimoUsoEm: string | null
  createdAt: string
}

const fmtData = (v: string | null) => v ? new Date(v).toLocaleString('pt-BR') : 'nunca usada'

export default function ChavesApiPage() {
  const [chaves, setChaves] = useState<ChaveApi[]>([])
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [chaveGerada, setChaveGerada] = useState<{ nome: string; chave: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = () => fetch('/api/chaves-api').then(r => r.json()).then(setChaves)
  useEffect(() => { carregar() }, [])

  const criar = async () => {
    if (!nome.trim()) { setErro('Informe um nome pra identificar o sistema.'); return }
    setCriando(true)
    setErro('')
    const r = await fetch('/api/chaves-api', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
    })
    const d = await r.json()
    setCriando(false)
    if (!r.ok) { setErro(d.error ?? 'Erro ao criar chave'); return }
    setChaveGerada({ nome: d.nome, chave: d.chave })
    setNome('')
    carregar()
  }

  const revogar = async (id: string, nomeChave: string) => {
    if (!confirm(`Revogar a chave de "${nomeChave}"? O sistema que usa essa chave para de conseguir acessar a API imediatamente.`)) return
    await fetch(`/api/chaves-api/${id}`, { method: 'DELETE' })
    carregar()
  }

  const copiar = async (chave: string) => {
    await navigator.clipboard.writeText(chave)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="flex items-center gap-2.5 mb-1">
        <KeyRound size={20} className="text-rdb-700" />
        <h1 className="font-titulo font-bold text-xl text-tinta">Chaves de API</h1>
      </div>
      <p className="text-sm text-tinta-fraca mb-6">
        Cada sistema externo que consome a API pública (<code>/api/gestao</code>) precisa de uma chave própria,
        enviada no header <code>x-api-key</code>. Revogar uma chave corta o acesso só daquele sistema, na hora.
      </p>

      {chaveGerada && (
        <div className="mb-6 bg-rdb-50 border-2 border-rdb-700 rounded-xl p-4">
          <p className="text-sm font-semibold text-tinta mb-1">
            Chave criada para "{chaveGerada.nome}" — copie agora, ela não vai aparecer de novo:
          </p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 bg-white border border-rdb-200 rounded-lg px-3 py-2 text-xs break-all">{chaveGerada.chave}</code>
            <button onClick={() => copiar(chaveGerada.chave)}
              className="shrink-0 flex items-center gap-1.5 bg-rdb-700 text-white text-xs font-semibold rounded-lg px-3 py-2">
              {copiado ? <Check size={14} /> : <Copy size={14} />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <button onClick={() => setChaveGerada(null)} className="text-xs text-tinta-fraca underline mt-2">Fechar</button>
        </div>
      )}

      <div className="flex items-end gap-2 mb-6">
        <div className="flex-1">
          <label className="block text-xs font-semibold mb-1.5">Nome do sistema que vai usar a chave</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Sistema de Gestão Financeira"
            className="w-full border-[1.5px] border-rdb-200 rounded-[10px] px-3 py-2.5 text-sm" />
        </div>
        <button onClick={criar} disabled={criando}
          className="bg-rdb-700 text-white font-semibold text-sm rounded-[10px] px-4 py-2.5 disabled:opacity-60">
          {criando ? 'Gerando…' : 'Gerar chave'}
        </button>
      </div>
      {erro && <p className="text-sm text-perigo mb-4">{erro}</p>}

      <div className="border border-rdb-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-rdb-50 text-left text-xs uppercase text-tinta-fraca">
              <th className="px-3 py-2">Sistema</th>
              <th className="px-3 py-2">Chave</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Último uso</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {chaves.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-tinta-fraca">Nenhuma chave criada ainda.</td></tr>
            )}
            {chaves.map(c => (
              <tr key={c.id} className="border-t border-rdb-100">
                <td className="px-3 py-2 font-medium">{c.nome}</td>
                <td className="px-3 py-2 font-mono text-xs text-tinta-fraca">{c.chavePrefixo}</td>
                <td className="px-3 py-2">
                  {c.ativa
                    ? <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-rdb-700 text-limao">ativa</span>
                    : <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-perigo/10 text-perigo">revogada</span>}
                </td>
                <td className="px-3 py-2 text-tinta-fraca">{fmtData(c.ultimoUsoEm)}</td>
                <td className="px-3 py-2 text-right">
                  {c.ativa && (
                    <button onClick={() => revogar(c.id, c.nome)}
                      className="flex items-center gap-1 text-perigo text-xs font-semibold ml-auto">
                      <Ban size={13} /> Revogar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
