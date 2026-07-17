import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Criando banco de dados...')

  // ── Plataformas ──────────────────────────────────────────────
  const ml = await db.plataforma.upsert({
    where: { slug: 'ml' }, update: {},
    create: { nome: 'Mercado Livre', slug: 'ml', comissaoPct: 0.14, taxaFixa: 1.25, impostoPct: 0.08, corHex: '#FFE600', observacoes: 'FULL: taxa fixa R$1,25. Clássico: R$0. Comissão varia por categoria (11-18%).' }
  })
  const shopee = await db.plataforma.upsert({
    where: { slug: 'shopee' }, update: {},
    create: { nome: 'Shopee', slug: 'shopee', comissaoPct: 0.20, taxaFixa: 4.00, impostoPct: 0.08, corHex: '#FF5722', observacoes: 'Comissão 20% fixa. Taxa fixa R$4,00 por pedido.' }
  })
  const tiktok = await db.plataforma.upsert({
    where: { slug: 'tiktok' }, update: {},
    create: { nome: 'TikTok Shop', slug: 'tiktok', comissaoPct: 0.12, taxaFixa: 4.00, impostoPct: 0.08, corHex: '#000000', observacoes: 'Comissão 12% + comissão influenciadores 10%.' }
  })
  const magalu = await db.plataforma.upsert({
    where: { slug: 'magalu' }, update: {},
    create: { nome: 'Magalu', slug: 'magalu', comissaoPct: 0.18, taxaFixa: 2.00, impostoPct: 0.08, corHex: '#0086FF', observacoes: 'Comissão 18%. Taxa fixa R$2,00.' }
  })

  // ── Fornecedores ─────────────────────────────────────────────
  const fornecedores = ['BRASBOL','VALLE','LIBANES','CASA SILVA','AVANTE','ABV','UNISAFRA','ONTARGET','YASMIN','GENEBRA','MERCANTIL SANTA PAULA','THIAGO CASTANHA','REINO']
  for (const nome of fornecedores) {
    await db.fornecedor.upsert({ where: { nome }, update: {}, create: { nome } })
  }

  // ── Produtos + Variações + Precificação ──────────────────────
  const produtos = [
    { sku: '134',      nome: 'Camomila',                  cat: 'Chás',          custoPorKg: 27.00,  pesos: [250, 500, 1000], embalML: 0.60, freteML: 1.25, embShopee: 0.60, freteShopee: 4.00 },
    { sku: '242',      nome: 'Psyllium',                  cat: 'Fibras',        custoPorKg: 15.00,  pesos: [100, 250, 500, 1000], embalML: 0.60, freteML: 1.50, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '220',      nome: 'Linhaça Dourada',            cat: 'Sementes',      custoPorKg: 11.00,  pesos: [500, 1000], embalML: 0.60, freteML: 2.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '249',      nome: 'Semente de Chia',            cat: 'Sementes',      custoPorKg: 17.50,  pesos: [250, 500, 1000], embalML: 0.60, freteML: 2.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '323',      nome: 'Capim Cidreira',             cat: 'Chás',          custoPorKg: 13.00,  pesos: [250, 500, 1000], embalML: 0.60, freteML: 1.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '340',      nome: 'Semente de Girassol Pepita', cat: 'Sementes',      custoPorKg: 13.38,  pesos: [250, 500, 1000], embalML: 0.60, freteML: 1.25, embShopee: 0.30, freteShopee: 4.00 },
    { sku: '261',      nome: 'Páprica Defumada',           cat: 'Temperos',      custoPorKg: 9.50,   pesos: [250, 500], embalML: 0.60, freteML: 1.50, embShopee: 0.30, freteShopee: 4.00 },
    { sku: '254',      nome: 'Tâmara sem Caroço',          cat: 'Frutas Secas',  custoPorKg: 21.00,  pesos: [500, 1000], embalML: 0.60, freteML: 2.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '122',      nome: 'Aveia Flocos Finos',         cat: 'Cereais',       custoPorKg: 4.80,   pesos: [500, 1000], embalML: 0.30, freteML: 1.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '195',      nome: 'Fécula de Batata',           cat: 'Farinhas',      custoPorKg: 8.20,   pesos: [500, 1000], embalML: 0.60, freteML: 1.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '169',      nome: 'Damasco Jumbo',              cat: 'Frutas Secas',  custoPorKg: 108.00, pesos: [500, 1000], embalML: 0.30, freteML: 4.00, embShopee: 2.00, freteShopee: 4.00, margemML: 0.10, margemShopee: 0.20 },
    { sku: '391',      nome: 'Canjica Branca',             cat: 'Cereais',       custoPorKg: 3.50,   pesos: [500, 1000], embalML: 0.60, freteML: 1.25, embShopee: 1.00, freteShopee: 4.00 },
    { sku: '405',      nome: 'Canjica Amarela',            cat: 'Cereais',       custoPorKg: 3.00,   pesos: [500, 1000], embalML: 1.00, freteML: 1.25, embShopee: 1.00, freteShopee: 4.00 },
    { sku: '302',      nome: 'Mix de Castanhas Premium',   cat: 'Castanhas',     custoPorKg: 65.00,  pesos: [500], embalML: 0.60, freteML: 3.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '125',      nome: 'Banana Chips Salgada',       cat: 'Snacks',        custoPorKg: 31.00,  pesos: [1000], embalML: 0.60, freteML: 3.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '161',      nome: 'Colorau',                   cat: 'Temperos',      custoPorKg: 12.00,  pesos: [500, 1000], embalML: 0.60, freteML: 1.50, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '250',      nome: 'Sene',                       cat: 'Chás',          custoPorKg: 12.00,  pesos: [250], embalML: 0.60, freteML: 1.25, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '379',      nome: 'Folha de Eucalipto',         cat: 'Chás',          custoPorKg: 13.00,  pesos: [250, 500], embalML: 0.60, freteML: 1.25, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '135',      nome: 'Canela em Pau',              cat: 'Temperos',      custoPorKg: 34.65,  pesos: [500, 1000], embalML: 1.00, freteML: 2.25, embShopee: 1.00, freteShopee: 4.00 },
    { sku: '136',      nome: 'Canela em Pó',               cat: 'Temperos',      custoPorKg: 18.90,  pesos: [500, 1000], embalML: 1.00, freteML: 1.25, embShopee: 0.60, freteShopee: 4.00 },
    { sku: '166',      nome: 'Cravo em Flor',              cat: 'Temperos',      custoPorKg: 47.50,  pesos: [250], embalML: 0.60, freteML: 1.50, embShopee: 0.60, freteShopee: 4.00 },
    { sku: '180',      nome: 'Fubá Mimoso',                cat: 'Farinhas',      custoPorKg: 3.10,   pesos: [1000], embalML: 1.00, freteML: 1.25, embShopee: 0.60, freteShopee: 4.00 },
    { sku: '158',      nome: 'Coco Ralado Fino',           cat: 'Especiais',     custoPorKg: 25.20,  pesos: [500], embalML: 1.00, freteML: 1.50, embShopee: 1.00, freteShopee: 4.00 },
    { sku: '463',      nome: 'Coco Ralado Médio',          cat: 'Especiais',     custoPorKg: 32.58,  pesos: [500], embalML: 1.00, freteML: 2.00, embShopee: 1.00, freteShopee: 4.00 },
    { sku: '181',      nome: 'Farelo de Aveia',            cat: 'Cereais',       custoPorKg: 5.16,   pesos: [500, 1000], embalML: 1.00, freteML: 1.25, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '248',      nome: 'Semente de Abóbora Crua',    cat: 'Sementes',      custoPorKg: 15.00,  pesos: [500, 1000], embalML: 0.60, freteML: 2.00, embShopee: 2.00, freteShopee: 4.00 },
    // Kits e produtos especiais
    { sku: 'KIT0045',  nome: 'Kit Chia + Linhaça 500g cada', cat: 'Kits',      custoPorKg: null, custoUnitario: 14.35, pesos: [], embalML: 0.80, freteML: 2.00, embShopee: 1.00, freteShopee: 4.00, margemML: 0.25, margemShopee: 0.20 },
    { sku: 'KIT0046',  nome: 'Mix Intestinal Psyllium+Linhaça+Chia', cat: 'Kits', custoPorKg: null, custoUnitario: 5.29, pesos: [], embalML: 0.60, freteML: 6.25, embShopee: 2.00, freteShopee: 4.00 },
    { sku: 'KIT0047',  nome: 'Kit 11 Temperos',            cat: 'Kits',         custoPorKg: null, custoUnitario: 16.77, pesos: [], embalML: 0.60, freteML: 2.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: 'KIT0050',  nome: 'Mix Semente Abóbora+Girassol 1kg', cat: 'Kits',  custoPorKg: null, custoUnitario: 23.19, pesos: [], embalML: 0.80, freteML: 2.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: 'VS000592', nome: 'Cúrcuma c/ Pimenta Preta 120caps', cat: 'Suplementos', custoPorKg: null, custoUnitario: 17.50, pesos: [], embalML: 1.00, freteML: 7.75, embShopee: 2.00, freteShopee: 4.00, comissaoML: 0.12, comissaoShopee: 0.20 },
    { sku: 'VS000119', nome: 'Maca Peruana Negra 120caps',  cat: 'Suplementos', custoPorKg: null, custoUnitario: 15.50, pesos: [], embalML: 1.00, freteML: 7.75, embShopee: 2.00, freteShopee: 4.00 },
    { sku: 'AB000953', nome: 'Farinha de Aveia sem Glúten', cat: 'Farinhas',    custoPorKg: 16.60,  pesos: [500, 1000], embalML: 0.60, freteML: 1.25, embShopee: 2.00, freteShopee: 4.00 },
    { sku: 'AB000869', nome: 'Sal de Mossoró 1kg',         cat: 'Temperos',     custoPorKg: null, custoUnitario: 12.00, pesos: [], embalML: 0.30, freteML: 1.00, embShopee: 2.00, freteShopee: 4.00 },
    { sku: '602',      nome: 'Mix de Sementes 5 grãos',    cat: 'Sementes',     custoPorKg: null, custoUnitario: 18.00, pesos: [], embalML: 0.60, freteML: 2.00, embShopee: 2.00, freteShopee: 4.00 },
  ] as const

  for (const p of produtos) {
    const custoPorKg = 'custoPorKg' in p && p.custoPorKg != null ? p.custoPorKg : null
    const custoUnitario = 'custoUnitario' in p ? p.custoUnitario as number : null
    const custoAtualizado = custoPorKg ?? custoUnitario ?? null

    await db.produto.upsert({
      where: { skuPrincipal: p.sku }, update: {},
      create: {
        skuPrincipal: p.sku, nome: p.nome, categoria: p.cat,
        unidadeCompra: custoPorKg ? 'kg' : 'unidade',
        custoPorKg, custoUnitario, custoAtualizado,
        tipoPrecificacao: custoPorKg ? 'peso_proporcional' : 'custo_fixo',
        status: 'ativo',
      }
    })

    const pesos = p.pesos as readonly number[]
    if (pesos.length > 0 && custoPorKg) {
      // Variações por peso
      for (const g of pesos) {
        const fator = g / 1000
        const custoCalc = Math.round(custoPorKg * fator * 100) / 100
        const custoVar = custoCalc
        const sufixo = g === 1000 ? 'O1kg' : g === 500 ? 'O500' : g === 250 ? 'O250' : 'O100'
        const skuVar = `${p.sku}-${sufixo}`
        const nome = `${p.nome} ${g === 1000 ? '1kg' : g + 'g'}`

        await db.variacao.upsert({
          where: { skuVariacao: skuVar }, update: {},
          create: { skuVariacao: skuVar, skuPrincipal: p.sku, nomeVariacao: nome, pesoGramas: g, fatorConversao: fator, custoCalculado: custoCalc, custoAdicional: 0, custoTotal: custoVar, status: 'ativo' }
        })
      }
    } else if (custoUnitario || custoPorKg) {
      // Produto sem variações (kit, suplemento, etc.)
      const custo = custoUnitario ?? (custoPorKg ?? 0)
      const skuVar = `${p.sku}-OUni`

      await db.variacao.upsert({
        where: { skuVariacao: skuVar }, update: {},
        create: { skuVariacao: skuVar, skuPrincipal: p.sku, nomeVariacao: p.nome, pesoGramas: null, fatorConversao: 1, custoCalculado: custo, custoAdicional: 0, custoTotal: custo, status: 'ativo' }
      })
    }
  }

  const totProd = await db.produto.count()
  const totVar  = await db.variacao.count()
  console.log(`✅ Seed concluído: ${totProd} produtos · ${totVar} variações`)
}

main().catch(console.error).finally(() => db.$disconnect())
