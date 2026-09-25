'use client'
import { Download } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

export default function BotaoExportar({ tipo, rotulo = 'Exportar' }: { tipo: 'produtos' | 'campanhas' | 'recomendacoes' | 'alertas' | 'promocoes'; rotulo?: string }) {
  const sp = useSearchParams()
  const q = new URLSearchParams(sp.toString())
  q.set('tipo', tipo)
  return <a href={`/api/exportar?${q}`} className="btn-primario"><Download size={15} aria-hidden />{rotulo}</a>
}
