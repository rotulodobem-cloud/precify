import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { ProdutoFornecedor } from '@/lib/parsearPDF'

interface ProdutoVinculado extends ProdutoFornecedor {
  skuInterno: string | null
  nomeInterno: string | null
  custoPorKgAtual: number | null
  variacao: number | null
}

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function similar(a: string, b: string): boolean {
  const na = normalizar(a)
  const nb = normalizar(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

export async function POST(req: Request) {
  try {
    const { produtos }: { produtos: ProdutoFornecedor[] } = await req.json()
    const produtosCadastrados = await db.produto.findMany({
      select: { skuPrincipal: true, nome: true, custoPorKg: true, custoUnitario: true }
    })
    const resultado: ProdutoVinculado[] = produtos.map(p => {
      const match = produtosCadastrados.find(c => similar(c.nome, p.descricao))
      if (!match) return { ...p, skuInterno: null, nomeInterno: null, custoPorKgAtual: null, variacao: null }
      const precoKgPDF = p.qtdEmbalagem && p.qtdEmbalagem > 0 ? p.preco / p.qtdEmbalagem : null
      const custoAtual = match.custoPorKg ?? match.custoUnitario
      let variacao: number | null = null
      if (precoKgPDF && custoAtual && custoAtual > 0) variacao = Math.round(((precoKgPDF - custoAtual) / custoAtual) * 1000) / 10
      return { ...p, skuInterno: match.skuPrincipal, nomeInterno: match.nome, custoPorKgAtual: custoAtual, variacao }
    })
    return NextResponse.json(resultado)
  } catch (e) {
    console.error('[pdf-vincular]', e)
    return NextResponse.json({ error: 'Erro ao vincular produtos' }, { status: 500 })
  }
}