# Precificação Multicanal (Rótulo do Bem) — Design

Data: 2026-07-13
Status: Aprovado pela usuária em conversa ("é isso")

## Contexto

A usuária tem uma ferramenta HTML própria e autônoma
(`precificacao-rotulo-do-bem.html`) que já usa hoje pra calcular o preço
ideal de venda em 4 canais (Loja Própria, Mercado Livre, Shopee, TikTok
Shop), com metodologia de despesas variáveis/fixas e margem-alvo por
canal. O problema: tudo é digitado à mão (SKU, nome, custo) e salvo só
no `localStorage` do navegador — sem ligação com os dados reais do
Precify, sem backup, sem acesso de outro computador.

Pedido: trazer essa ferramenta pra dentro do Precify como uma página
nova (a Calculadora atual continua existindo, sem mudanças), mas com
SKU/nome/custo puxados automaticamente do cadastro real de produtos, e
os cálculos salvos no banco de dados real.

Essa metodologia é importante especialmente para precificar a **Loja
Própria** — canal que hoje não existe em nenhuma tela do Precify.

## Decisões confirmadas com a usuária

1. Página nova e separada no menu — não substitui nem altera a Calculadora atual.
2. Mantém a identidade visual verde/lima da Rótulo do Bem (cores, fontes
   Poppins/Montserrat, nome da marca) — não adapta pro visual padrão
   indigo/cinza do resto do Precify.
3. Salvar cálculo grava no banco de dados real do Precify (não mais só
   no navegador), pra ficar disponível em qualquer lugar e entrar nos
   backups automáticos.
4. Mercado Livre é dividido em **ML Full** e **ML Clássico** nessa
   ferramenta também (o HTML original tratava como um canal só) — ML
   Full precisa reaproveitar a mesma lógica de frete (tabela peso×preço)
   que já existe e funciona na Calculadora atual.

## Escopo

### 1. Canais (5 no total)

- **Loja Própria** (novo — não existe em nenhuma outra tela do Precify)
- **ML Full** — reaproveita a função de cálculo de frete já existente na
  Calculadora (`freteFullCalc`, tabela por peso×faixa de preço).
- **ML Clássico** — usa o modelo simples de campos editáveis (embalagem,
  comissão, outras taxas, taxa fixa, frete em R$ digitado direto) igual
  aos demais canais desta ferramenta, **não** a tabela de frete por peso
  que a Calculadora usa pra Clássico. Decisão técnica minha — se a
  usuária preferir a tabela por peso aqui também, ajusto depois da
  revisão deste documento.
- **Shopee** — mantém o ajuste automático de faixa (a comissão e taxa
  fixa mudam sozinhas conforme o preço calculado cai numa faixa: até
  R$79,99 → 20%/R$4; R$80–99,99 → 14%/R$16; R$100–199,99 → 14%/R$20;
  acima de R$200 → 14%/R$26), com opção de desligar o automático e
  digitar manualmente.
- **TikTok Shop** — comissão 6% + outras taxas 6% + taxa fixa R$4,
  editável.

Valores padrão de cada canal (embalagem, comissão, taxa fixa, frete,
margem-alvo) ficam como constantes no código, iguais aos do HTML
original — editáveis na tela a cada cálculo, mas não é uma tela de
"cadastro de canal" separada (mesmo comportamento do HTML: os valores
editados na tela valem só pro cálculo/salvamento atual).

### 2. Dois modos de cálculo

- **Descobrir o preço ideal**: informa a margem desejada por canal → sistema calcula o preço de venda.
- **Analisar um preço**: informa um preço já praticado → sistema calcula a margem real resultante.

Mesmas fórmulas do HTML original (despesas variáveis gerais % + despesas
fixas rateio % aplicadas a todos os canais, mais comissão/outras
taxas/taxa fixa/frete específicos de cada canal).

### 3. Autopreenchimento por SKU (o pedido original)

- Campo de SKU/nome reaproveita o mesmo componente de busca fuzzy já
  usado na Calculadora (`GET /api/busca`, aceita SKU ou nome, mostra
  sugestões quando há mais de um resultado).
- Ao selecionar um produto:
  - Nome do produto preenchido automaticamente (editável).
  - Se o produto tem variações cadastradas (100g, 250g...), lista as
    variações pra usuária escolher uma; custo do produto preenche com o
    `custoTotal`/`custoCalculado` daquela variação (editável).
  - Se não tiver variação (ou ela não escolher nenhuma), usa
    `custoAtualizado` do produto (editável).
- Nada impede digitar um SKU/nome que não existe no cadastro (ela também
  usa isso pra simular produtos hipotéticos) — nesse caso os campos
  ficam em branco pra preencher na mão, como hoje.

### 4. Salvar / Biblioteca

Modelo novo no banco, dedicado a esta ferramenta (não reaproveita
`Precificacao`/`Plataforma` — motivo técnico: o modelo `Precificacao`
permite só 1 linha por SKU×Plataforma, o que impediria guardar o preço
de ML Full e ML Clássico do mesmo produto ao mesmo tempo, que é
exatamente o que essa tela precisa mostrar lado a lado):

```prisma
model CalculoMulticanal {
  id                   String   @id @default(cuid())
  skuVariacao          String?  // liga à Variacao real, se existir no cadastro
  sku                  String
  nome                 String
  variacao             String?
  custoProduto         Float
  despesasVariaveisPct Float    @default(8)
  despesasFixasPct     Float    @default(0)
  modo                 String   @default("preco") // preco | margem
  precoTeste           Float?   // usado no modo "margem"
  canais               Json     // config completa de cada um dos 5 canais nesse cálculo
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@unique([sku, variacao])
}
```

- `POST /api/calculo-multicanal` — cria ou atualiza (mesma lógica de
  "salvar por SKU+Variação" do HTML: se já existe uma linha com esse
  SKU+Variação, atualiza; senão, cria).
- `GET /api/calculo-multicanal?q=...` — lista/busca por SKU ou nome, pra
  tabela da biblioteca.
- `DELETE /api/calculo-multicanal/[id]`.
- A tabela da biblioteca recalcula os 5 preços a partir dos dados
  salvos toda vez que renderiza (não guarda o preço final pronto) —
  mesmo comportamento do HTML: se a fórmula mudar no futuro, os cálculos
  salvos são recalculados com a fórmula nova automaticamente.

### 5. Visual

Página com CSS próprio (cores verde `#055E2B`/lima `#CDDE35`, fontes
Poppins/Montserrat via Google Fonts, cabeçalho com a marca "Rótulo do
Bem"), praticamente idêntico ao HTML original, só que os dados vêm do
Precify em vez de digitados/localStorage. O menu lateral do Precify
continua normal; só o conteúdo da página tem esse visual distinto,
com um ícone de folha (🍃, lucide `Leaf`) no menu combinando com a marca.

## Fora de escopo

- Não mexe na Calculadora existente, nem no fluxo de Precificação
  (`Precificacao`/`Plataforma`) já existentes.
- Não cria uma tela de "cadastro" separada pros canais desta ferramenta
  — configuração é por cálculo, igual ao HTML original.
- Não tenta unificar o modelo de dados desta ferramenta com o resto do
  sistema além do autopreenchimento por SKU — são intencionalmente
  paralelos.

## Riscos e observações

- `@@unique([sku, variacao])` com `variacao` opcional: no Postgres,
  valores `NULL` não colidem entre si em constraints únicas — ou seja,
  se a usuária salvar duas vezes o mesmo SKU sem preencher variação, vai
  criar duas linhas em vez de atualizar uma. Na prática, se ela sempre
  preencher variação (ou usar consistentemente o SKU da variação
  específica, não o SKU principal) isso não deve acontecer. Se virar
  problema real, ajustamos depois.
- ML Clássico usando o modelo simples (campo de frete editável) em vez
  da tabela por peso da Calculadora é uma decisão técnica meio aberta —
  sinalizada acima pra confirmar na revisão deste documento.
- Alterações de schema (`prisma db push`) serão aplicadas com backup
  manual antes, mesmo padrão já usado nas duas rodadas anteriores.
