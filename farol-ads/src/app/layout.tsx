import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Farol Ads',
  description: 'Onde você está ganhando e onde está perdendo dinheiro com ads, produto por produto.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
