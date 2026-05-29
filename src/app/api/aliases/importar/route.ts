import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { fornecedor, itens } = body as {
    fornecedor: string
    itens: { descricao: string; codigo?: string; preco?: number; embalagem?: string }[]
  }

  if (!fornecedor || !itens?.length)
    return NextResponse.json({ error: 'Fornecedor e itens obrigatórios' }, { status: 400 })

  // Busca todos os produtos e aliases existentes
  const produtos = await db.produto.findMany({ select: { skuPrincipal: true, nome: true } })
  const aliasesExistentes = await db.fornecedorAlias.findMany({
    where: { fornecedor, ativo: true },
    select: { nomeNoFornecedor: true, codigoFornecedor: true, skuPrincipal: true },
  })

  const resultado = itens.map(item => {
    const descNorm = item.descricao.toLowerCase().trim()

    // 1. Tenta por alias existente (código do fornecedor)
    if (item.codigo) {
      const aliasCod = aliasesExistentes.find(a => a.codigoFornecedor === item.codigo)
      if (aliasCod) return { ...item, status: 'vinculado' as const, skuPrincipal: aliasCod.skuPrincipal, via: 'codigo' }
    }

    // 2. Tenta por alias existente (nome no fornecedor)
    const aliasNome = aliasesExistentes.find(a => a.nomeNoFornecedor.toLowerCase().trim() === descNorm)
    if (aliasNome) return { ...item, status: 'vinculado' as const, skuPrincipal: aliasNome.skuPrincipal, via: 'nome_alias' }

    // 3. Tenta por nome similar no cadastro de produtos
    // Busca palavras-chave do nome do fornecedor e compara com nomes dos produtos
    const palavras = descNorm
      .replace(/\d+\s*(kg|g|ml|l|un|pc|sc|cx|fd)\b/gi, '') // remove pesos/unidades
      .replace(/[^a-záàâãéêíóôõúç\s]/gi, '') // remove chars especiais
      .trim()
      .split(/\s+/)
      .filter(p => p.length > 2) // ignora palavras curtas

    const sugestoes = produtos
      .map(p => {
        const nomeNorm = p.nome.toLowerCase()
        const matches = palavras.filter(pal => nomeNorm.includes(pal))
        return { ...p, score: matches.length / Math.max(palavras.length, 1) }
      })
      .filter(p => p.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    if (sugestoes.length > 0) {
      return { ...item, status: 'sugestao' as const, skuPrincipal: sugestoes[0].skuPrincipal, sugestoes: sugestoes.map(s => ({ sku: s.skuPrincipal, nome: s.nome, score: s.score })) }
    }

    return { ...item, status: 'novo' as const, skuPrincipal: null, sugestoes: [] }
  })

  const stats = {
    total: resultado.length,
    vinculados: resultado.filter(r => r.status === 'vinculado').length,
    sugestoes: resultado.filter(r => r.status === 'sugestao').length,
    novos: resultado.filter(r => r.status === 'novo').length,
  }

  return NextResponse.json({ fornecedor, resultado, stats })
}

// Salvar aliases em batch
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { fornecedor, vinculos } = body as {
    fornecedor: string
    vinculos: { descricao: string; codigo?: string; embalagem?: string; preco?: number; skuPrincipal: string }[]
  }

  if (!fornecedor || !vinculos?.length)
    return NextResponse.json({ error: 'Dados obrigatórios' }, { status: 400 })

  let criados = 0
  let atualizados = 0

  for (const v of vinculos) {
    if (!v.skuPrincipal || !v.descricao) continue

    const existing = await db.fornecedorAlias.findFirst({
      where: { fornecedor, nomeNoFornecedor: v.descricao.trim() },
    })

    if (existing) {
      await db.fornecedorAlias.update({
        where: { id: existing.id },
        data: {
          skuPrincipal: v.skuPrincipal,
          codigoFornecedor: v.codigo || null,
          embalagem: v.embalagem || null,
          ultimoPreco: v.preco || null,
          dataUltimoPreco: v.preco ? new Date() : null,
          ativo: true,
        },
      })
      atualizados++
    } else {
      await db.fornecedorAlias.create({
        data: {
          skuPrincipal: v.skuPrincipal,
          fornecedor,
          nomeNoFornecedor: v.descricao.trim(),
          codigoFornecedor: v.codigo || null,
          embalagem: v.embalagem || null,
          ultimoPreco: v.preco || null,
          dataUltimoPreco: v.preco ? new Date() : null,
        },
      })
      criados++
    }
  }

  return NextResponse.json({ ok: true, criados, atualizados, total: criados + atualizados })
}
