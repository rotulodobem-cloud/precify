'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Bell, ChartColumn, House, Layers, LogOut, Megaphone, Menu, Package, Settings, Star, Tag, Upload, X,
} from 'lucide-react'
import { useState } from 'react'

const LINKS = [
  { href: '/', rotulo: 'Visão Geral', icone: House },
  { href: '/produtos', rotulo: 'Produtos', icone: Package },
  { href: '/campanhas', rotulo: 'Campanhas', icone: Megaphone },
  { href: '/recomendacoes', rotulo: 'Recomendações', icone: Star, contador: 'acao' as const },
  { href: '/alertas', rotulo: 'Alertas', icone: Bell, contador: 'alertas' as const },
  { href: '/promocoes', rotulo: 'Promoções', icone: Tag },
  { href: '/relatorios', rotulo: 'Relatórios', icone: ChartColumn },
  { href: '/canais', rotulo: 'Canais', icone: Layers },
]
const RODAPE = [
  { href: '/importar', rotulo: 'Importar relatório', icone: Upload },
  { href: '/configuracoes', rotulo: 'Configurações', icone: Settings },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
        <rect x="3" y="15" width="6" height="12" rx="1.5" fill="#7FA86A" />
        <rect x="12" y="9" width="6" height="18" rx="1.5" fill="#B9CDAA" />
        <rect x="21" y="3" width="6" height="24" rx="1.5" fill="#CDDE35" />
      </svg>
      <div>
        <p className="text-white font-bold text-lg leading-none">Farol</p>
        <p className="text-rdb-300 text-[11px] mt-0.5">Ads Multicanal</p>
      </div>
    </div>
  )
}

export default function Sidebar({ contadores }: { contadores: { acao: number; alertas: number } }) {
  const path = usePathname()
  const sp = useSearchParams()
  const [aberto, setAberto] = useState(false)
  // Links mantêm os filtros globais (período, canal, campanha, estado) ao trocar de tela.
  const manter = new URLSearchParams()
  for (const k of ['periodo', 'de', 'ate', 'canal', 'campanha', 'estado']) { const v = sp.get(k); if (v) manter.set(k, v) }
  const qs = manter.toString() ? `?${manter}` : ''

  const item = (l: { href: string; rotulo: string; icone: typeof House; contador?: 'acao' | 'alertas' }) => {
    const ativo = l.href === '/' ? path === '/' : path.startsWith(l.href)
    const n = l.contador ? contadores[l.contador] : 0
    const I = l.icone
    return (
      <Link key={l.href} href={`${l.href}${qs}`} onClick={() => setAberto(false)}
        aria-current={ativo ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${ativo ? 'bg-rdb-600 text-white font-semibold' : 'text-rdb-100 hover:bg-rdb-800 hover:text-white'}`}>
        <I size={17} aria-hidden />
        <span className="flex-1">{l.rotulo}</span>
        {n > 0 && <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold text-white" aria-label={`${n} pendentes`}>{n}</span>}
      </Link>
    )
  }

  const conteudo = (
    <>
      <nav className="flex-1 space-y-1 px-3" aria-label="Menu principal">{LINKS.map(item)}</nav>
      <div className="space-y-1 border-t border-rdb-800 px-3 pt-3">{RODAPE.map(item)}</div>
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rdb-700 text-sm font-semibold text-white">MM</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white leading-tight">Michele</p>
          <p className="text-xs text-rdb-300">Rótulo do Bem</p>
        </div>
        <button aria-label="Sair" title="Sair" className="rounded-md p-1.5 text-rdb-300 hover:bg-rdb-800 hover:text-white"
          onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }}>
          <LogOut size={16} />
        </button>
      </div>
    </>
  )

  return (
    <>
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-rdb-900 min-h-screen sticky top-0 h-screen">
        <div className="px-5 py-6"><Logo /></div>
        {conteudo}
      </aside>
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-rdb-900 px-4 py-3">
        <Logo />
        <button aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} aria-expanded={aberto} onClick={() => setAberto(!aberto)} className="rounded-md p-2 text-white">
          {aberto ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {aberto && <div className="lg:hidden fixed inset-0 top-[58px] z-40 flex flex-col bg-rdb-900 pt-2 overflow-auto">{conteudo}</div>}
    </>
  )
}
