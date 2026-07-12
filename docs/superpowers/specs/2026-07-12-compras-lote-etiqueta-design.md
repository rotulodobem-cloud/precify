# Compras multi-produto + Lote/Validade + Etiqueta — Design

Data: 2026-07-12
Status: Aprovado pelo usuário em conversa

## Contexto

A dona do sistema precisa rastrear lote e validade dos produtos comprados,
como processo interno de vigilância sanitária. Isso exige duas mudanças
encadeadas em Compras: (1) poder registrar vários produtos de uma mesma
nota fiscal/pedido numa única ação, e (2) poder editar lançamentos
antigos. Depois disso, o módulo de Lote se apoia em cima do registro de
Compra existente.

Lançamento de lote é **opcional por compra**, não obrigatório. Produtos de
prateleira (comprados prontos, já com lote/validade impresso pelo próprio
fabricante) simplesmente não recebem lançamento de lote nesse sistema —
a usuária só usa "Lançar lote" para produtos que ela mesma precisa
rastrear internamente (tipicamente comprados a granel e reembalados). Uma
`Compra` sem nenhum `Lote` vinculado é um estado normal e esperado, não um
lançamento pendente/incompleto.

Decisão de arquitetura importante: `Compra` continua sendo um registro por
produto (como hoje), preservando todo o dashboard/analytics existente
(ranking, curva de preço, mensal, melhor preço etc., que já consultam
`Compra` nesse formato). "Vários produtos numa compra" é resolvido criando
vários registros de `Compra` numa única submissão de formulário, todos
compartilhando o mesmo `numeroNF`. Isso evita fragmentar as consultas
analíticas existentes com um novo model "pai" de pedido.

O model `PedidoCompra`/`PedidoItem` já existente no schema **não** é
reaproveitado aqui — ele é usado hoje (só no front, nunca grava no banco)
pela aba "Montar pedido" de Compras, que serve pra montar uma lista pra
enviar ao fornecedor **antes** da compra acontecer. É um conceito
diferente (pré-compra vs. compra recebida) e fica como está.

## Escopo

### 1. Compra: campo de NF/Pedido + entrada multi-produto

- Adicionar campos a `Compra` em `prisma/schema.prisma`:
  `numeroNF String?` e `numeroPedido String?`.
- Reescrever o modal "Registrar compra" em `src/app/compras/page.tsx`:
  - Campos únicos no topo: fornecedor, data da compra, número de NF ou
    pedido (pelo menos um dos dois, não obrigatório ter os dois).
  - Lista de produtos com botão "adicionar produto" — cada linha com SKU
    (busca/autocomplete, reaproveitando o padrão já existente em
    `src/app/api/compras/sku`), quantidade, custo total.
  - Um campo único de frete total da compra. Ao salvar, o frete é
    rateado proporcionalmente entre os produtos pelo valor de
    `custoTotal` de cada linha (produto mais caro absorve mais frete).
  - Ao confirmar, criar um registro de `Compra` por linha de produto
    (reaproveitando a lógica de `POST /api/compras` hoje existente,
    adaptada para aceitar um array de itens numa única chamada/transação).

### 2. Editar compras no histórico

- Adicionar rota `PATCH /api/compras/[id]` (não existe hoje — hoje só há
  `GET`/`POST` em `/api/compras` e `DELETE` em `/api/compras/[id]`).
- Adicionar ícone de editar na aba Histórico
  (`src/app/compras/page.tsx`, tabela de histórico), abrindo o mesmo
  formulário do lançamento com os valores atuais preenchidos. Todos os
  campos ficam editáveis (fornecedor, data, quantidade, custos, NF).
- Se a compra editada for a mais recente daquele `skuPrincipal`, recalcular
  `Produto.custoAtualizado`/`custoPorKg`/`custoUnitario` (mesma lógica que
  já roda ao criar uma nova compra, reaproveitar).

### 3. Model `Lote`

Novo model em `prisma/schema.prisma`:

```prisma
model Lote {
  id            String    @id @default(cuid())
  compraId      String
  compra        Compra    @relation(fields: [compraId], references: [id], onDelete: Cascade)
  numeroLote    String
  geradoAuto    Boolean   @default(false)
  quantidade    Float
  dataValidade  DateTime
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([numeroLote])
  @@index([compraId])
}
```

- `Compra` precisa da relação inversa `lotes Lote[]`.
- Uma `Compra` pode ter vários `Lote` (ex.: 60kg do lote A + 40kg do lote
  B da mesma compra de 100kg).
- Fornecedor, data da compra e número de NF/pedido **não** são duplicados
  em `Lote` — vêm sempre da `Compra` relacionada (evita dado desencontrado
  se a compra for editada depois).

### 4. Fluxo de lançamento do lote

- Botão "Lançar lote" em cada linha do histórico de Compras (pode ser
  lançado a qualquer momento depois da compra, não precisa ser na hora).
- Formulário mostra (somente leitura, vindos da compra): fornecedor, data
  da compra, número de NF/pedido, produto, quantidade total da compra.
- Campos preenchíveis: número do lote (opcional — se vazio, gera
  automático), quantidade coberta por esse lote (default = quantidade
  restante da compra), data de validade (obrigatório).
- Permite lançar mais de um lote pra mesma compra, repetindo o botão
  "Lançar lote" — cada lançamento subtrai da quantidade restante.

### 5. Geração automática de código de lote

- Se o campo "número do lote" for deixado em branco: gerar
  `AAAAMMDD-{skuPrincipal}` usando a data da compra (não a data do
  lançamento do lote).
- Se já existir um lote com esse código exato (ex.: duas entregas do
  mesmo produto no mesmo dia), acrescentar sufixo `-2`, `-3` etc. até ser
  único.
- Marcar `geradoAuto: true` nesses casos, para diferenciar na busca/etiqueta
  de um código realmente informado pelo fornecedor.

### 6. Aba "Lotes" dedicada

- Novo item no Sidebar: "Lotes".
- Nova página `src/app/lotes/page.tsx` com:
  - Lista de todos os lotes lançados (mais recentes primeiro), mostrando
    produto, fornecedor, número do lote, validade, quantidade.
  - Campo de busca por número de lote (`GET /api/lotes?q=...`, contains).
  - Alerta de vencimento: linha fica **amarela** se a validade está a 30
    dias ou menos de vencer, **vermelha** se já venceu. Sem configuração
    de dias pela usuária nessa primeira versão — 30 dias fixo no código.
- Nova rota `src/app/api/lotes/route.ts` (GET com busca, POST para criar)
  e `src/app/api/lotes/[id]/route.ts` (GET individual, DELETE se
  necessário corrigir um lançamento errado).
- Dashboard (`src/app/page.tsx`): novo card/contador "X lotes vencendo"
  (dentro da janela de 30 dias, incluindo já vencidos), visível na tela
  inicial sem precisar entrar na aba Lotes. Clicar leva para a aba Lotes
  já filtrada nesses itens.

### 7. Etiqueta térmica

- Botão "Imprimir etiqueta" em cada lote (na aba Lotes e/ou no histórico
  de Compras).
- Nova rota `src/app/lotes/[id]/etiqueta/page.tsx` — página HTML pura,
  sem layout do app (sem Sidebar), estilizada com `@media print` e
  `@page { size: 8cm 8cm; margin: 0 }`, contendo: nome do fornecedor,
  data da compra, data de validade, número do lote. Tamanho da etiqueta
  definido como constante isolada (fácil trocar/adicionar outros tamanhos
  depois, conforme a usuária sinalizou que vai precisar).
- Impressão via `window.print()` do navegador — usuária escolhe a
  impressora térmica no diálogo padrão do Windows.

## Fora de escopo

- Impressão direta via protocolo de impressora (ZPL/ESC-POS) — descartado
  em favor da impressão via navegador, mais simples e não depende de
  marca/modelo de impressora.
- Reaproveitar `PedidoCompra`/`PedidoItem` — mantido como está, sem
  relação com este spec.
- Configuração do prazo de alerta (30 dias) pela usuária — fixo no código
  nessa primeira versão, sem tela de configuração.

## Riscos e observações

- Alterações em `Compra` (novos campos) e novo model `Lote` exigem
  `prisma db push` em produção. Fazer backup manual antes.
- O rateio de frete precisa ser determinístico e visível para a usuária
  conferir antes de salvar (mostrar preview de quanto frete cada linha
  recebeu, não só aplicar silenciosamente).
- Editar uma compra antiga que já tem lote lançado: o lote não duplica os
  dados da compra (item 3), então edições em fornecedor/data/NF refletem
  automaticamente em todos os lotes ligados — sem necessidade de
  sincronização manual.
