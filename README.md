# Precify — Sistema de Precificação para Marketplace

Sistema web completo para precificação de produtos no **Mercado Livre** e **Shopee**, construído a partir da análise das suas planilhas reais.

---

## 📋 Análise das Planilhas

### Planilha de Precificação (`Planilha_de_Precificação.xlsx`)

| Item | Detalhe |
|---|---|
| Abas | TIKTOK, ML, Shopee, Cálculo Base, Magalu, kits |
| Produtos ML | 135 linhas |
| Produtos Shopee | 37 linhas |
| Fórmula central | `PV = (CUSTO PRODUTO + EMBALAGEM + FRETE) / (1 − MARGEM − COMISSÃO − IMPOSTO)` |
| Variações por peso | 100g, 250g, 500g, 1kg — calculadas proporcionalmente ao custo/kg |

**Problemas detectados e tratados:**
- 88 produtos sem SKU → sistema gera identificador automático na importação
- Nomes duplicados (Feijão de Corda, Frutas Cristalizadas, Linhaça Dourada, Colorau, Canela em Pó) → alertados como avisos
- EMBALAGEM + Coleta FULL misturado em um campo → mantido como campo único
- Preços negativos em alguns produtos (ex: Farinha de Uva, Frutas Desidratadas) → detectados como `PREJUIZO`

**Comissões identificadas:**
- Mercado Livre: 14% padrão (varia por categoria/tipo de anúncio)
- Shopee: 20% fixo
- TikTok: 12% + 10% influenciadores
- Magalu: 18%

**Imposto identificado:** 8% (ML/Shopee) e 8,29% (Controle de Compras)

### Planilha de Compras (`CONTROLE_DE_COMPRAS.xlsx`)

| Item | Detalhe |
|---|---|
| Abas | Dashboard, Compras, Fornecedores, Parametros, Aux_SKU, Cadastro |
| Total de compras | 545 registros |
| SKUs únicos | 379 |
| Fornecedores | 20 (BRASBOL, VALLE, LIBANES, CASA SILVA, AVANTE, ABV...) |
| Gasto total | R$ 61.067 |

**Fluxo de dados:**
O sistema puxa automaticamente: SKU, Produto (via lookup no Cadastro), Fornecedor, Quantidade, Custo_total, Frete, Outros_custos → calcula `Custo_unitario = (Custo_total + Frete + Outros) / Quantidade` → compara com compra anterior → detecta variação > 5% → atualiza custo do produto no banco.

---

## 🏗️ Arquitetura do Sistema

### Modelo de dados

```
Produto (SKU principal)
  └── Variação (SKU de variação, peso em gramas)
        └── Precificação (por plataforma)
              - custoEmbalagem, custoFrete, custoColeta
              - comissaoPct, impostoPct
              - precoAtual (digitado), precoMinimo/Ideal/Maximo/Promocional (calculados)
              - margemAtual, statusMargem
Compra
  - registros históricos de compras
  - comparação automática de custo vs compra anterior
  - atualiza custoPorKg do Produto ao importar
```

### Fórmulas implementadas

```
custo_variacao  = (custoPorKg × pesoGramas) / 1000 + custoAdicional
custo_total     = custoProduto + custoEmbalagem + custoFrete + custoColeta
precoVenda      = custoTotal / (1 − comissao − imposto − margem)
precoMinimo     = custo / (1 − com − imp − 0.20)   → margem 20%
precoIdeal      = custo / (1 − com − imp − 0.25)   → margem 25%
precoMaximo     = custo / (1 − com − imp − 0.30)   → margem 30%
precoPromocional= precoIdeal × 1.45                 → inflacionado 45%
```

### Stack

- **Next.js 14** (App Router) — frontend + API routes
- **Tailwind CSS 3** — estilização
- **Prisma 5 + SQLite** — banco de dados local
- **xlsx** — leitura/escrita de planilhas

---

## 🚀 Instalação e uso local

### Pré-requisitos

- **Node.js 18+** → [nodejs.org](https://nodejs.org)
- **npm** ou **pnpm** ou **yarn**

### Passo a passo

```bash
# 1. Instalar dependências
npm install

# 2. Criar banco de dados e aplicar schema
npx prisma db push

# 3. Popular com dados iniciais (plataformas + produtos de exemplo)
npx tsx prisma/seed.ts

# 4. Iniciar servidor de desenvolvimento
npm run dev
```

Acesse: **http://localhost:3000**

### Comandos disponíveis

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção
npm run start        # servidor de produção
npx prisma studio    # interface visual do banco de dados
npm run db:push      # aplicar mudanças no schema
npm run db:seed      # popular dados iniciais
```

---

## 📖 Guia de uso

### 1. Importar suas planilhas

Acesse **Importar XLSX** no menu lateral.

**Para importar o Controle de Compras:**
1. Selecione "Detectar automaticamente" ou "Controle de Compras"
2. Arraste o arquivo `CONTROLE_DE_COMPRAS.xlsx`
3. Clique em Importar
4. ✅ Todos os custos dos produtos são atualizados automaticamente

**Para importar a Planilha de Precificação:**
1. Selecione "Planilha de Precificação"
2. Arraste o arquivo `Planilha_de_Precificação.xlsx`
3. O sistema importa as abas ML e Shopee automaticamente

### 2. Verificar o dashboard

O **Dashboard** mostra:
- Distribuição de margem (saudável / atenção / prejuízo / sem preço)
- Alertas de preços negativos e margens baixas
- Comparativo ML × Shopee (qual plataforma rende mais por SKU)
- Custos que aumentaram mais de 5% recentemente

### 3. Atualizar preços

Em **Precificação**, clique no ícone de edição de qualquer linha para:
- Ver o preço ideal, mínimo e promocional calculados
- Clicar num dos botões para usar aquele preço como sugestão
- Digitar um preço praticado e ver a margem calculada em tempo real

### 4. Exportar tabela final

Clique em **Exportar XLSX** no rodapé do menu lateral para baixar uma planilha com:
- Aba "Precificação" — todos os SKUs × plataformas com preços calculados
- Aba "Compras" — histórico completo de compras

---

## 📂 Estrutura do projeto

```
precify/
├── prisma/
│   ├── schema.prisma        # Modelo de dados
│   └── seed.ts              # Dados iniciais (plataformas + produtos)
├── src/
│   ├── app/
│   │   ├── page.tsx         # Dashboard
│   │   ├── busca/           # Busca por SKU
│   │   ├── precificacao/    # Tabela principal de preços
│   │   ├── produtos/        # CRUD produtos
│   │   ├── variacoes/       # CRUD variações
│   │   ├── plataformas/     # CRUD plataformas
│   │   ├── compras/         # Histórico de compras
│   │   ├── importar/        # Upload de planilhas
│   │   └── api/             # API routes (REST)
│   ├── components/ui/
│   │   ├── Sidebar.tsx      # Menu lateral
│   │   └── index.tsx        # Modal, Badge, Spinner etc.
│   └── lib/
│       ├── calculos.ts      # Motor de cálculo (fórmulas)
│       └── db.ts            # Prisma client singleton
├── .env                     # DATABASE_URL
├── next.config.js
├── tailwind.config.js
└── package.json
```

---

## 🔧 Customização

### Alterar margem padrão

Em `src/lib/calculos.ts`, a função `calcPrecificacaoCompleta` usa 20/25/30%.  
Para alterar, modifique os valores em `calcPrecoMinimo`, `calcPrecoIdeal` e `calcPrecoMaximo`.

### Adicionar nova plataforma

1. Acesse **Plataformas** → **Nova plataforma**
2. Preencha nome, comissão, taxa fixa e imposto
3. As novas precificações já usam os valores cadastrados

### Ajustar imposto

O imposto padrão é 8% (0.08) para ML/Shopee e 8,29% (0.0829) para compras.  
Pode ser alterado por linha de precificação na tela de edição.
