# Tolerância de Preço — Loja Própria — Design

Data: 2026-07-17
Status: Aprovado pela usuária em conversa

## Contexto

Hoje o preço calculado da Loja Própria (canal `lp` do `CalculoMulticanal`) reage automaticamente
a mudanças de custo — mas o preço que está de fato sendo cobrado no site (via Bling) não é
rastreado em lugar nenhum. Não existe forma de saber, sem checar manualmente produto por produto,
quando o preço praticado ficou defasado o suficiente do preço calculado pra valer a pena
reajustar. O Dashboard (Onda B) já tem um sinal aproximado pra isso ("produtos pra ajustar", baseado
em variação de custo >5%), mas é um proxy grosseiro — não compara de fato o preço calculado com o
preço realmente praticado.

Esse projeto ("Fase 2", mencionado como "Parte 2" no desenho da Onda B) fecha essa lacuna: rastreia
o preço praticado da Loja Própria e avisa quando ele se afasta demais do preço calculado, dentro de
uma tolerância configurável.

## Decisões confirmadas com a usuária

1. **Preço praticado é digitado/importado, não integrado via API** — a usuária usa Bling como
   sistema de gestão da loja. Ela exporta uma planilha do Bling com os preços atuais e importa no
   Precify. Não há integração automática direta com o Bling nesta fase.
2. **Importação em massa é a peça central, não edição individual** — com centenas de produtos,
   editar preço praticado um por um no Multicanal RdB seria inviável operacionalmente. A forma
   principal de popular/atualizar é subindo a planilha exportada do Bling.
3. **Casamento por SKU/código** — cada linha da planilha do Bling é casada com o produto/variação
   do Precify pelo código, não pelo nome.
4. **Prévia antes de confirmar** — igual ao padrão já usado na importação de compras: depois do
   upload, mostra o que vai mudar (SKU, preço antigo vs novo) e os SKUs da planilha que não bateram
   com nada no Precify, antes de gravar.
5. **Importação parcial, nunca apaga por omissão** — um SKU do Precify que não aparece na planilha
   carregada mantém o preço praticado anterior (ou continua sem valor, se nunca foi informado).
   A importação só atualiza o que veio no arquivo.
6. **Tolerância é um valor único global**, não por produto/categoria — uma % que vale pra tudo,
   configurável.
7. **Alerta nas duas direções** — tanto quando o preço calculado subiu acima do praticado (perdendo
   margem) quanto quando desceu abaixo (oportunidade de ficar mais competitivo).
8. **Aparece em dois lugares**: dentro do Multicanal RdB (o preço praticado fica visível — e também
   editável ali, pra correção pontual sem precisar subir planilha de novo) e dentro do Dashboard
   (substituindo o sinal aproximado atual do bloco "produtos pra ajustar", para os produtos que já
   têm preço praticado registrado).
9. **Fallback pros produtos sem preço praticado ainda** — enquanto não for preenchido (via
   importação ou edição manual), o Dashboard continua usando o sinal aproximado de hoje (variação de
   custo >5%) para aquele produto. Assim que o preço praticado é registrado, passa a usar a
   comparação precisa.

## Arquitetura

### Schema

Novo campo em `CalculoMulticanal`:
- `precoPraticadoLP Float?` — preço real cobrado hoje na Loja Própria.
- `precoPraticadoLPAtualizadoEm DateTime?` — quando foi a última atualização (via import ou edição
  manual), útil pra saber se o dado está desatualizado.

Nova configuração global em `Configuracao` (chave `tolerancia_loja_propria_pct`, valor string tipo
`"10"`) — reaproveita o model key-value já existente no schema, sem precisar de tabela nova.

### Cálculo do desvio

Sempre recalculado "ao vivo" (sem job/gatilho por compra): como o `custoProduto` do
`CalculoMulticanal` já é atualizado automaticamente a cada compra lançada (existente desde a Onda A),
o preço calculado da Loja Própria (via `calcularCanalModoPreco` com `def.key === 'lp'`) já reflete o
custo mais recente sempre que é lido. A comparação roda no momento da leitura:

```
desvioPct = (precoCalculadoLP - precoPraticadoLP) / precoPraticadoLP
```

Se `abs(desvioPct) > tolerância`, entra em alerta, com a direção (`subir` se `precoCalculadoLP >
precoPraticadoLP`, `baixar` caso contrário).

Só se aplica a produtos com o canal `lp` ativo (`canaisAtivos.lp === true`) e `precoPraticadoLP`
preenchido.

### Importação em massa (planilha do Bling)

Nova tela de import, seguindo o padrão de duas etapas já usado na importação de compras
(validar → confirmar):
1. Upload do arquivo (XLSX), leitura das colunas de código/SKU e preço — o nome exato das colunas
   que o Bling exporta ainda não foi confirmado, então a leitura aceita variações comuns (ex:
   "Código"/"SKU"/"Codigo" pra identificação, "Preço"/"Preco"/"Valor" pro valor), a ajustar no
   primeiro teste real com uma planilha do Bling.
2. Tela de prévia: lista de SKUs casados (nome, preço antigo, preço novo) e lista separada de SKUs
   da planilha sem correspondência no Precify.
3. Confirmação grava `precoPraticadoLP` + `precoPraticadoLPAtualizadoEm` só nos SKUs casados. SKUs
   do Precify ausentes da planilha não são tocados.

### Multicanal RdB

No card da Loja Própria: campo "preço praticado hoje" (editável, correção pontual), preço calculado
ao lado, e um selo visual quando o desvio ultrapassa a tolerância configurada, indicando a direção.

### Dashboard

O bloco "produtos pra ajustar" (já existente, Onda B) passa a: para produtos com `precoPraticadoLP`
preenchido, usar a comparação precisa (desvio vs tolerância) em vez do sinal aproximado; para
produtos sem preço praticado ainda, manter o sinal aproximado atual (variação de custo >5%) como
fallback. Continua sem mostrar preço específico de canal de marketplace — regra que já vale pro
Dashboard inteiro.

### Configuração da tolerância

Um campo editável simples ("Tolerância de preço: X%") no topo da tela do Multicanal RdB, junto de
onde os selos de desvio já aparecem — sem precisar de uma tela de configurações nova só pra isso. Lê
e grava direto em `Configuracao` (chave `tolerancia_loja_propria_pct`).

## Fora de escopo

- Integração automática com a API do Bling (a usuária exporta manualmente).
- Tolerância por produto/categoria (fica global nesta fase).
- Qualquer alteração em preços/margens de canais de marketplace — este projeto é só sobre Loja
  Própria.

## Riscos e verificação

- Sem framework de testes automatizado — verificação por `npx tsc --noEmit`, `npm run build`, testes
  ao vivo.
- Sem banco de staging — produção. A importação em massa grava preço praticado em potencialmente
  centenas de registros de uma vez; a prévia antes de confirmar é a proteção principal contra uma
  planilha errada.
