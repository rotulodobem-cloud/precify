import { NextRequest, NextResponse } from 'next/server'
import pdf from 'pdf-parse'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const data = await pdf(buffer)
  const text = data.text

  // Parsear linhas do PDF — cada linha com descrição, código e preço
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3)

  const itens: { descricao: string; codigo?: string; preco?: number; embalagem?: string }[] = []

  for (const line of lines) {
    // Padrão típico de tabela de fornecedor:
    // "SEMENTE DE CHIA 25KG 571 SC R$ 541,00 R$ 525,00"
    // ou "AMENDOIM S/ PELE 25KG 103 SC R$ 221,50 R$ 215,00"

    // Tenta extrair preço (R$ ou valor numérico no final)
    const precoMatch = line.match(/R?\$?\s*([\d.,]+)\s*$/i)
      || line.match(/R?\$?\s*([\d.,]+)\s+R?\$?\s*[\d.,]+\s*$/i)
    if (!precoMatch) continue

    // Ignora linhas de cabeçalho
    if (/^(Descrição|Cod\.|Un\b|Débito|Á vista|Desconto)/i.test(line)) continue
    if (/Tabela de Produtos|Preços sujeitos|TABELA ATUALIZADO/i.test(line)) continue

    // Tenta extrair código do fornecedor (número isolado de 1-5 dígitos)
    const parts = line.split(/\s+/)
    let descricao = ''
    let codigo: string | undefined
    let preco: number | undefined
    let embalagem: string | undefined

    // Busca o preço — último valor numérico no formato brasileiro
    const allPrices = line.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g)
    if (allPrices && allPrices.length > 0) {
      // Pega o último preço (geralmente é o "à vista")
      const lastPrice = allPrices[allPrices.length - 1]
      preco = parseFloat(lastPrice.replace(/\./g, '').replace(',', '.'))
    }

    // Busca código — número de 1-5 dígitos que aparece depois do nome e antes de SC/PC/CX/FD/UN
    const codMatch = line.match(/^(.+?)\s+(\d{1,5})\s+(SC|PC|CX|FD|UN|KG)\s/i)
    if (codMatch) {
      descricao = codMatch[1].trim()
      codigo = codMatch[2]
      embalagem = codMatch[3]
    } else {
      // Fallback: pega tudo antes do primeiro preço
      const firstPriceIdx = line.search(/R?\$\s*\d/)
      if (firstPriceIdx > 0) {
        const beforePrice = line.substring(0, firstPriceIdx).trim()
        // Remove unidade e código do final
        const cleanMatch = beforePrice.match(/^(.+?)\s+(\d{1,5})?\s*(SC|PC|CX|FD|UN|KG)?\s*$/i)
        if (cleanMatch) {
          descricao = cleanMatch[1].trim()
          codigo = cleanMatch[2] || undefined
          embalagem = cleanMatch[3] || undefined
        } else {
          descricao = beforePrice
        }
      } else {
        continue
      }
    }

    if (descricao.length < 3) continue

    // Detecta embalagem no nome (ex: "25KG", "5KG", "10X1KG")
    const embMatch = descricao.match(/(\d+(?:[xX]\d+)?(?:[.,]\d+)?\s*(?:KG|G|ML|L|UN))\b/i)
    if (embMatch && !embalagem) {
      embalagem = embMatch[1]
    }

    itens.push({ descricao, codigo, preco, embalagem })
  }

  return NextResponse.json({
    totalLinhas: lines.length,
    itensExtraidos: itens.length,
    itens,
  })
}
