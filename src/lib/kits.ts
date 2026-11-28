// Montagem dos componentes de um kit: lê os números do formulário e calcula o
// custo de cada componente pelo cadastro do produto. Usado ao criar e ao editar.
import db from '@/lib/db'

export class ErroKit extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem) }
}

/** Número vindo do formulário: aceita "0,80", "0.80" e 0.8; vazio ou inválido vira null. */
export function numeroForm(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || !v.trim()) return null
  const t = v.trim()
  // com vírgula, o ponto é separador de milhar ("1.234,50"); sem vírgula, o ponto é decimal
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}

export interface ComponenteEntrada { skuProduto?: unknown; quantidadeGramas?: unknown; quantidadeUn?: unknown }

export async function montarComponentes(lista: ComponenteEntrada[]) {
  const dados = []
  let custoTotal = 0
  for (const [i, comp] of lista.entries()) {
    const sku = typeof comp.skuProduto === 'string' ? comp.skuProduto.trim() : ''
    if (!sku) throw new ErroKit(400, `O componente ${i + 1} está sem SKU.`)
    const gramas = numeroForm(comp.quantidadeGramas)
    const un = numeroForm(comp.quantidadeUn)
    if (!(gramas && gramas > 0) && !(un && un > 0)) {
      throw new ErroKit(400, `Informe a quantidade (gramas ou unidades) do componente ${sku}.`)
    }
    const produto = await db.produto.findFirst({ where: { skuPrincipal: { equals: sku, mode: 'insensitive' } } })
    if (!produto) throw new ErroKit(404, `O produto ${sku} não está cadastrado em Produtos.`)

    let custo = 0
    if (gramas && produto.custoPorKg) custo = (produto.custoPorKg * gramas) / 1000
    else if (un && produto.custoUnitario) custo = produto.custoUnitario * un
    else if (produto.custoAtualizado) custo = gramas ? (produto.custoAtualizado * gramas) / 1000 : produto.custoAtualizado * (un ?? 1)
    custo = Math.round(custo * 10000) / 10000

    custoTotal += custo
    dados.push({
      skuProduto: produto.skuPrincipal, nomeProduto: produto.nome,
      quantidadeGramas: gramas && gramas > 0 ? gramas : null,
      quantidadeUn: un && un > 0 ? un : null,
      custoUnitario: custo,
    })
  }
  return { dados, custoTotal }
}

/** Resposta de erro sempre em JSON, para a tela conseguir mostrar a mensagem. */
export function respostaErro(e: unknown) {
  if (e instanceof ErroKit) return { status: e.status, corpo: { error: e.message } }
  console.error('[kits]', e)
  return { status: 500, corpo: { error: 'Não foi possível salvar o kit. Confira os campos e tente de novo.' } }
}
