import { NextRequest, NextResponse } from 'next/server'

// Timeout helper
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ])

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    // Dynamic import to avoid build issues
    const pdfParse = (await import('pdf-parse')).default
    const data = await withTimeout(pdfParse(buffer), 15000) // 15s timeout
    const text = data.text

    const itens = parsearTextoFornecedor(text)

    return NextResponse.json({
      totalLinhas: text.split('\n').length,
      itensExtraidos: itens.length,
      itens,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    if (msg === 'timeout') {
      return NextResponse.json({ error: 'PDF muito grande ou complexo. Tente converter para Excel primeiro.', itens: [] }, { status: 408 })
    }
    return NextResponse.json({ error: `Erro ao processar PDF: ${msg}`, itens: [] }, { status: 500 })
  }
}

function parsearTextoFornecedor(text: string) {
  const itens: { descricao: string; codigo?: string; preco?: number; embalagem?: string }[] = []
  const linhas = text.split('\n').map(l => l.trim()).filter(l => l.length > 3)

  for (const linha of linhas) {
    // Ignora cabeçalhos e rodapés
    if (/^(Descrição|Cod\.|Un\b|Débito|Á vista|Desconto|Tabela|Preços sujeitos|TABELA|Tel|Fax|Email|Rua|www\.|http)/i.test(linha)) continue
    if (linha.split(/\s+/).length < 2) continue

    // Tenta extrair preço brasileiro (ex: 525,00 ou 1.234,50)
    const precos = linha.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g)
    if (!precos) continue

    // Pega o último preço (geralmente é o "à vista")
    const ultimoPreco = precos[precos.length - 1]
    const preco = parseFloat(ultimoPreco.replace(/\./g, '').replace(',', '.'))
    if (preco < 0.5 || preco > 100000) continue // filtra valores absurdos

    // Remove os preços da linha para isolar o nome e código
    let semPrecos = linha
    for (const p of precos) semPrecos = semPrecos.replace(p, '')
    semPrecos = semPrecos.replace(/R\$\s*/g, '').replace(/\s+/g, ' ').trim()

    // Tenta extrair código (número de 1-5 dígitos isolado)
    const codMatch = semPrecos.match(/^(.+?)\s+(\d{1,5})\s+(SC|PC|CX|FD|UN|KG|SC|FD)?\s*$/i)
    let descricao = ''
    let codigo: string | undefined
    let embalagem: string | undefined

    if (codMatch) {
      descricao = codMatch[1].trim()
      codigo = codMatch[2]
      embalagem = codMatch[3] || undefined
    } else {
      // Remove número solto do final
      const simplMatch = semPrecos.match(/^(.+?)\s+(\d{1,5})\s*$/)
      if (simplMatch) {
        descricao = simplMatch[1].trim()
        codigo = simplMatch[2]
      } else {
        descricao = semPrecos.trim()
      }
    }

    if (descricao.length < 3 || descricao.length > 80) continue

    // Extrai embalagem do nome (ex: 25KG, 5KG, 10X1KG)
    if (!embalagem) {
      const embMatch = descricao.match(/\b(\d+(?:[xX]\d+)?(?:[.,]\d+)?\s*(?:KG|G|ML|L|UN))\b/i)
      if (embMatch) embalagem = embMatch[1].toUpperCase()
    }

    itens.push({ descricao, codigo, preco, embalagem })
  }

  return itens
}
