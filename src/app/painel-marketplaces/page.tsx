'use client'
import { useState } from 'react'
import Link from 'next/link'
import Rentabilidade from '@/components/ui/Rentabilidade'

export default function PainelMarketplacesPage() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Painel de marketplaces</h1>
          <p className="text-sm text-tinta-fraca mt-0.5">Mercado Livre, Shopee e TikTok Shop: o que sobra depois de custo, comissão, imposto e publicidade</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="inp-sm w-auto" value={mes} onChange={e => e.target.value && setMes(e.target.value)} />
          <Link href="/precificar-marketplaces" className="btn-ghost text-xs">Precificar para marketplaces</Link>
        </div>
      </div>
      <Rentabilidade mes={mes} escopo="marketplace" comProdutos />
    </div>
  )
}
