import type { Metadata } from 'next'
import { Poppins, Montserrat } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/ui/Sidebar'
import BuscaGlobal from '@/components/ui/BuscaGlobal'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--fonte-titulo',
  display: 'swap',
})

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fonte-corpo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Precify — Precificação Marketplace',
  description: 'Sistema de precificação inteligente para Mercado Livre, Shopee e outros marketplaces',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} ${montserrat.variable}`}>
      <body className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 p-6 overflow-auto">
          {children}
        </main>
        <BuscaGlobal />
      </body>
    </html>
  )
}
