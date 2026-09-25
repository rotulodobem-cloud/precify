'use client'
import { useState } from 'react'
import { Lock } from 'lucide-react'

export default function Login() {
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    const f = new FormData(e.currentTarget)
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: f.get('usuario'), senha: f.get('senha') }),
    })
    setEnviando(false)
    if (!r.ok) { setErro((await r.json().catch(() => ({}))).error ?? 'Não foi possível entrar.'); return }
    const voltar = new URLSearchParams(window.location.search).get('voltar')
    window.location.href = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/'
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-rdb-900 p-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 30 30" aria-hidden>
            <rect x="3" y="15" width="6" height="12" rx="1.5" fill="#4A8443" /><rect x="12" y="9" width="6" height="18" rx="1.5" fill="#1B6E36" /><rect x="21" y="3" width="6" height="24" rx="1.5" fill="#055E2B" />
          </svg>
          <div><h1 className="text-xl font-bold">Farol</h1><p className="text-sm text-tinta-fraca">Ads Multicanal · Rótulo do Bem</p></div>
        </div>
        <label className="mb-3 block text-sm font-medium">Usuário
          <input name="usuario" autoComplete="username" required className="campo mt-1 w-full" />
        </label>
        <label className="mb-5 block text-sm font-medium">Senha
          <input name="senha" type="password" autoComplete="current-password" required className="campo mt-1 w-full" />
        </label>
        {erro && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}
        <button disabled={enviando} className="btn-primario w-full justify-center py-2.5 disabled:opacity-60"><Lock size={15} aria-hidden />{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  )
}
