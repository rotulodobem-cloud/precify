export interface ProdutoFornecedor {
  codigoFornecedor: string
  un: string
  descricao: string
  preco: number
  qtdEmbalagem: number | null
  unidadeEmbalagem: string | null
  fornecedor: string
  dataValidade: string | null
}

export interface ResultadoParsePDF {
  produtos: ProdutoFornecedor[]
  fornecedor: string
  dataValidade: string | null
  totalProdutos: number
  erros: string[]
}

function extrairQuantidade(descricao: string): { qtd: number | null; un: string | null } {
  const multiMatch = descricao.match(/(\d+)[Xx](\d+(?:[.,]\d+)?)\s*(KG|G|LT|ML|UN|L)\b/i)
  if (multiMatch) {
    const n = parseInt(multiMatch[1])
    const m = parseFloat(multiMatch[2].replace(',', '.'))
    const un = multiMatch[3].toUpperCase()
    const total = un === 'G' || un === 'ML' ? (n * m) / 1000 : n * m
    return { qtd: total, un: un === 'G' ? 'KG' : un === 'ML' ? 'LT' : un }
  }
  const simpleMatch = descricao.match(/(\d+(?:[.,]\d+)?)\s*(KG|G|LT|ML|UN)\b/i)
  if (simpleMatch) {
    const qtd = parseFloat(simpleMatch[1].replace(',', '.'))
    const un = simpleMatch[2].toUpperCase()
    if (un === 'G') return { qtd: qtd / 1000, un: 'KG' }
    if (un === 'ML') return { qtd: qtd / 1000, un: 'LT' }
    return { qtd, un }
  }
  return { qtd: null, un: null }
}

export function parsearListaFornecedor(textoCompleto: string): ResultadoParsePDF {
  const produtos: ProdutoFornecedor[] = []
  const erros: string[] = []
  let fornecedor = ''
  let dataValidade: string | null = null

  // Detectar data de validade
  const dataMatch = textoCompleto.match(/(\d{2}\/\d{2}\/\d{4})/)
  if (dataMatch) dataValidade = dataMatch[1]

  // Detectar nome do fornecedor (aparece no início, antes dos códigos)
  const fornMatch = textoCompleto.match(/VALLE NATURALLE|BRASBOL|LIBANES|CASA SILVA|AVANTE|ABV/i)
  if (fornMatch) fornecedor = fornMatch[0]

  // Extrair todos os produtos usando regex no texto corrido
  // Padrão: 8 dígitos + espaço + 2-4 letras maiúsculas + espaço + descrição + pontos + marca + preço
  // Ex: "00001103 PCT ACAFRAO DA TERRA 05 KG................VALLE NATURALLE 52,00"
  const regexProduto = /(\d{8})\s+([A-Z]{2,4})\s+([\w\s\/À-ÿ%°\.]+?)\s*\.{4,}[\w\s\.]*?(\d{1,5},\d{2})/g

  let match
  while ((match = regexProduto.exec(textoCompleto)) !== null) {
    const [, codigoFornecedor, un, descricaoRaw, precoStr] = match
    const descricao = descricaoRaw.trim().replace(/\s+/g, ' ')
    const preco = parseFloat(precoStr.replace(',', '.'))
    if (!descricao || preco <= 0) continue
    const { qtd, un: unEmbalagem } = extrairQuantidade(descricao)
    produtos.push({ codigoFornecedor, un, descricao, preco, qtdEmbalagem: qtd, unidadeEmbalagem: unEmbalagem, fornecedor, dataValidade })
  }

  return { produtos, fornecedor, dataValidade, totalProdutos: produtos.length, erros }
}