import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

interface LinhaImportacao {
  linha: number
  data: string
  nomeProduto: string
  fornecedor: string
  quantidade: number
  valorTotal: number
  skuInformado?: string
}

export async function POST(req: NextRequest) {
  const { linhas }: { linhas: LinhaImportacao[] } = await req.json()

  const resultado = []

  for (const linha of linhas) {
    // 1. Se tem SKU informado — buscar diretamente
    if (linha.skuInformado?.trim()) {
      const produto = await db.produto.findUnique({
        where: { skuPrincipal: linha.skuInformado.trim() },
        select: { skuPrincipal: true, nome: true, custoPorKg: true },
      })

      // Buscar último preço de venda conhecido
      const ultimaPrecificacao = await db.precificacao.findFirst({
        where: { variacao: { skuPrincipal: linha.skuInformado.trim() } },
        orderBy: { updatedAt: 'desc' },
        select: { precoAtual: true, plataforma: { select: { nome: true } } },
      })

      resultado.push({
        ...linha,
        status: produto ? 'confirmado' : 'sku_nao_encontrado',
        skuSugerido: produto?.skuPrincipal ?? null,
        nomeCadastrado: produto?.nome ?? null,
        custoPorKg: produto?.custoPorKg ?? null,
        precoVenda: ultimaPrecificacao?.precoAtual ?? null,
        canalPreco: ultimaPrecificacao?.plataforma.nome ?? null,
        sugestoes: [],
      })
      continue
    }

    // 2. Sem SKU — buscar por nome similar
    const todos = await db.produto.findMany({
      select: { skuPrincipal: true, nome: true, custoPorKg: true },
    })

    // Busca fuzzy simples por palavras do nome
    const palavras = linha.nomeProduto.toLowerCase().split(/\s+/).filter(p => p.length > 2)
    const sugestoes = todos
      .map(p => {
        const nLower = p.nome.toLowerCase()
        const score = palavras.filter(w => nLower.includes(w)).length
        return { ...p, score }
      })
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(p => ({ skuPrincipal: p.skuPrincipal, nome: p.nome, custoPorKg: p.custoPorKg }))

    // Buscar preço do mais provável
    let precoVenda = null
    let canalPreco = null
    if (sugestoes.length > 0) {
      const ultimaPrecificacao = await db.precificacao.findFirst({
        where: { variacao: { skuPrincipal: sugestoes[0].skuPrincipal } },
        orderBy: { updatedAt: 'desc' },
        select: { precoAtual: true, plataforma: { select: { nome: true } } },
      })
      precoVenda = ultimaPrecificacao?.precoAtual ?? null
      canalPreco = ultimaPrecificacao?.plataforma.nome ?? null
    }

    resultado.push({
      ...linha,
      status: sugestoes.length > 0 ? 'sugestao' : 'novo',
      skuSugerido: sugestoes[0]?.skuPrincipal ?? null,
      nomeCadastrado: sugestoes[0]?.nome ?? null,
      custoPorKg: sugestoes[0]?.custoPorKg ?? null,
      precoVenda,
      canalPreco,
      sugestoes,
    })
  }

  return NextResponse.json(resultado)
}
