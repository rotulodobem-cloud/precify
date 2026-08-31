'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, Layers, Store, Tag,
  ShoppingCart, Upload, Download, Search, ChevronRight,
  Zap, Truck, Settings, Leaf, LogOut, Percent, Handshake, KeyRound
} from 'lucide-react'
import { EVENTO_ABRIR_BUSCA } from '@/components/ui/BuscaGlobal'
import type { Role } from '@/lib/auth'

const links = [
  { href: '/',               label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/busca',          label: 'Busca por SKU',   icon: Search },
  { divider: true,           label: 'Precificação' },
  { href: '/precificacao-multicanal', label: 'Multicanal RdB', icon: Leaf },
  { href: '/precos-praticados', label: 'Preços praticados', icon: Percent },
  { href: '/frete',          label: 'Frete ML',        icon: Truck },
  { divider: true,           label: 'Cadastros' },
  { href: '/produtos',       label: 'Produtos',        icon: Package },
  { href: '/kits',           label: 'Kits',            icon: Layers },
  { href: '/variacoes',      label: 'Variações',       icon: Layers },
  { href: '/plataformas',    label: 'Plataformas',     icon: Store },
  { divider: true,           label: 'Operacional' },
  { href: '/compras',        label: 'Compras',         icon: ShoppingCart },
  { href: '/lotes',          label: 'Lotes',           icon: Tag },
  { href: '/importar',       label: 'Importar XLSX',   icon: Upload },
  { href: '/parceiro',       label: 'Tela do parceiro', icon: Handshake },
  { href: '/chaves-api',     label: 'Chaves de API',   icon: KeyRound },
  { href: '/configuracoes',  label: 'Configurações',   icon: Settings },
]

export default function Sidebar({ role }: { role: Role | null }) {
  const path = usePathname()

  // Menu reduzido é do parceiro, não da página: quem é admin mantém o menu
  // inteiro mesmo visitando /parceiro.
  if (role === 'partner') {
    return (
      <aside className="w-56 shrink-0 bg-rdb-800 min-h-screen flex flex-col">
        <div className="px-4 py-5 border-b border-rdb-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rdb-700 flex items-center justify-center">
              <Zap size={15} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">Precify</p>
              <p className="text-rdb-400 text-[10px] mt-0.5">Parceiro</p>
            </div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="px-2 pb-3 border-t border-rdb-700/60 pt-3">
          <button
            onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-rdb-200 hover:bg-rdb-700 hover:text-white transition-all w-full text-left"
          >
            <LogOut size={15} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-56 shrink-0 bg-rdb-800 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-rdb-700/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rdb-700 flex items-center justify-center">
            <Zap size={15} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">Precify</p>
            <p className="text-rdb-400 text-[10px] mt-0.5">Marketplace</p>
          </div>
        </div>
      </div>

      {/* Busca global */}
      <div className="px-2 pt-3">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_BUSCA))}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-rdb-700/50 text-rdb-200 hover:bg-rdb-700 hover:text-white transition-all"
        >
          <Search size={15} className="shrink-0" />
          <span className="flex-1 text-left">Buscar produto</span>
          <kbd className="text-[9px] text-rdb-400 border border-rdb-700/60 rounded px-1 py-0.5">Ctrl K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {links.map((item, i) => {
          if ('divider' in item && item.divider) {
            return (
              <div key={i} className="pt-3 pb-1 px-3">
                <p className="text-[10px] font-semibold text-rdb-400 uppercase tracking-wider">{item.label}</p>
              </div>
            )
          }
          const { href, label, icon: Icon } = item as { href: string; label: string; icon: React.ElementType }
          const active = path === href || (href !== '/' && path.startsWith(href + '/'))
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group
                ${active ? 'bg-limao text-rdb-800 font-semibold' : 'text-rdb-200 hover:bg-rdb-700 hover:text-white'}`}>
              <Icon size={15} className="shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {active && <ChevronRight size={12} className="opacity-50" />}
            </Link>
          )
        })}
      </nav>

      {/* Export */}
      <div className="px-2 pb-3 border-t border-rdb-700/60 pt-3">
        <a href="/api/exportar"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-rdb-200 hover:bg-rdb-700 hover:text-white transition-all">
          <Download size={15} />
          <span>Exportar XLSX</span>
        </a>
      </div>
      <div className="px-4 pb-3">
        <p className="text-rdb-400 text-[10px]">v2.0 · PostgreSQL · Next.js 14</p>
      </div>
    </aside>
  )
}
