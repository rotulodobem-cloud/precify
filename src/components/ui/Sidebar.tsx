'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, Layers, Store, Tag,
  ShoppingCart, Upload, Download, Search, ChevronRight, Zap, Truck
} from 'lucide-react'

const links = [
  { href: '/',             label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/busca',        label: 'Busca por SKU',  icon: Search },
  { href: '/precificacao', label: 'Precificação',   icon: Tag },
  { href: '/produtos',     label: 'Produtos',       icon: Package },
  { href: '/variacoes',    label: 'Variações',      icon: Layers },
  { href: '/plataformas',  label: 'Plataformas',    icon: Store },
  { href: '/compras',      label: 'Compras',        icon: ShoppingCart },
  { href: '/frete',        label: 'Frete ML',       icon: Truck },
  { href: '/importar',     label: 'Importar XLSX',  icon: Upload },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 shrink-0 bg-gray-900 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Zap size={15} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">Precify</p>
            <p className="text-gray-500 text-[10px] mt-0.5">Marketplace</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href))
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group
                ${active ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Icon size={15} className="shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {active && <ChevronRight size={12} className="opacity-50" />}
            </Link>
          )
        })}
      </nav>

      {/* Export */}
      <div className="px-2 pb-3 border-t border-gray-800 pt-3">
        <a href="/api/exportar"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-all">
          <Download size={15} />
          <span>Exportar XLSX</span>
        </a>
      </div>
      <div className="px-4 pb-3">
        <p className="text-gray-600 text-[10px]">v1.0 · SQLite · Next.js 14</p>
      </div>
    </aside>
  )
}
