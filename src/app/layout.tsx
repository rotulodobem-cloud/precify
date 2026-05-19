import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/ui/Sidebar'

export const metadata: Metadata = {
  title: 'Precify — Precificação Marketplace',
  description: 'Sistema de precificação inteligente para Mercado Livre, Shopee e outros marketplaces',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 p-6 overflow-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
