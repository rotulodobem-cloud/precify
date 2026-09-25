import { Suspense } from 'react'
import Sidebar from '@/components/Sidebar'
import { carregarPainel } from '@/lib/dados'
import { lerFiltros } from '@/lib/filtros'

export const dynamic = 'force-dynamic'

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  // Contadores do menu: sempre sobre o recorte padrão (últimos 30 dias, todos os canais).
  const d = await carregarPainel(lerFiltros({}))
  const contadores = {
    acao: d.anuncios.filter(a => ['REDUZIR', 'PAUSAR', 'OTIMIZAR'].includes(a.diagnostico.estado)).length,
    alertas: d.alertas.filter(a => a.status !== 'resolvido').length,
  }
  return (
    <div className="lg:flex min-h-screen">
      <Suspense><Sidebar contadores={contadores} /></Suspense>
      <main className="flex-1 min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 space-y-6">{children}</main>
    </div>
  )
}
