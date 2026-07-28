import type { Metadata } from 'next'
import { Poppins, Montserrat } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import Sidebar from '@/components/ui/Sidebar'
import BuscaGlobal from '@/components/ui/BuscaGlobal'
import { roleFromCookie } from '@/lib/auth'

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
  // O menu depende de quem está logado, não da página aberta: assim a dona da
  // loja continua com o menu inteiro ao visitar a tela do parceiro.
  const role = roleFromCookie(cookies().get('precify_auth')?.value)

  return (
    <html lang="pt-BR" className={`${poppins.variable} ${montserrat.variable}`}>
      <body className="flex min-h-screen">
        <Sidebar role={role} />
        <main className="flex-1 min-w-0 p-6 overflow-auto">
          {children}
        </main>
        <BuscaGlobal role={role} />
      </body>
    </html>
  )
}
