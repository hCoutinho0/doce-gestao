# Auditoria completa — Confeitto

Realizada em 2026-09-05, cobrindo segurança/isolamento multi-confeitaria,
bugs funcionais e qualidade de código. Build e lint estavam limpos antes e
depois das correções abaixo.

## 🔴 Segurança

1. **[Corrigido]** Webhooks do WhatsApp (`app/api/whatsapp/webhook/route.ts`)
   e do Mercado Pago (`app/api/checkout/webhook/route.ts`) só validavam a
   assinatura **se** a variável de segredo estivesse configurada — sem ela,
   qualquer POST forjado era aceito. `WHATSAPP_APP_SECRET` estava ausente
   no `.env.local`, deixando o webhook do bot sem validação nenhuma.
   Permitia, sem autenticação: descobrir status/valor de qualquer pedido
   adivinhando o número sequencial, e usar o número de WhatsApp do negócio
   como retransmissor de mensagens. **Correção**: as duas rotas agora
   recusam (401) quando o segredo não está configurado, em vez de pular a
   checagem.
2. **[Corrigido]** Comparação do segredo do lembrete diário
   (`app/api/reminders/daily/route.ts`) usava `!==` em vez de comparação
   de tempo constante. Baixo risco prático, mas corrigido com
   `crypto.timingSafeEqual`.

**Sem achados críticos de vazamento entre confeitarias** — toda rota que
toca dado de uma confeitaria específica deriva o `bakeryId` exclusivamente
da sessão autenticada, nunca de um valor enviado pelo cliente (exceto o
`bakeryId` do checkout público, que só decide *pra qual confeitaria* o
pedido vai, sem permitir preço ou papel administrativo diferentes).

## 🟠 Bugs funcionais

3. **[Corrigido]** Bot do WhatsApp nunca encontrava os pedidos `#01` a
   `#09` — o texto digitado não recebia o zero à esquerda antes de
   comparar com o id salvo. Corrigido com `padStart(2, '0')`.
4. **[Corrigido]** Condição de corrida na numeração de pedidos: dois
   pedidos criados quase ao mesmo instante podiam receber o mesmo número,
   porque o contador era lido e escrito sem nenhuma trava. Corrigido com
   um novo helper `updateStateAtomic` (`lib/cosmos.ts`) que usa o ETag do
   documento no Cosmos DB e tenta de novo automaticamente se outra
   requisição escreveu no meio do caminho.
5. **[Corrigido]** O mesmo tipo de corrida existia em vários outros
   pontos de leitura-e-escrita do array inteiro: criação automática de
   cliente na Fidelidade, lista de pedidos, selo/financeiro lançados na
   conclusão do pedido, edição/exclusão de cliente, inscrições de
   notificação. Todos migrados para `updateStateAtomic`.
6. **[Corrigido]** Em Precificação, clicar "Remover ficha técnica" não
   limpava os campos na tela — clicar "Salvar" de novo recriava a ficha
   removida sem querer. Corrigido fazendo o formulário reiniciar também
   quando a ficha deixa de existir, não só quando o produto muda.
7. **[Corrigido]** Em Pedidos, lançar um pedido retroativo usando uma
   semana arquivada do cardápio não devolvia o seletor pra semana atual
   depois — risco de montar o próximo pedido (do dia) sem perceber, com
   preços/itens antigos. Corrigido: o seletor volta pra "semana atual"
   assim que um pedido é lançado com sucesso.

## 🟡 Qualidade — notado, não alterado agora

8. **[Corrigido]** Webhooks do WhatsApp/Mercado Pago fixos na Lavily
   ganharam um comentário explicando a limitação (antes só
   `lib/cosmos.ts` documentava isso, não os dois arquivos que realmente
   usam a constante).
9. A rota de checkout do Mercado Pago (já desativada na interface) ainda
   aponta pro `/cardapio` antigo em vez de `/{bakeryId}/cardapio` — só
   importa quando essa forma de pagamento for reativada por confeitaria.
10. `UserRole` está definido duas vezes (`lib/auth.ts` e `lib/tenant.ts`)
    — podem dessincronizar se um papel for renomeado no futuro.
11. Excluir um pedido Concluído não desfaz o lançamento no financeiro nem
    o selo já dado — fica "órfão" no histórico. Comportamento antigo, não
    introduzido agora.
12. Nomenclatura cosmética: `DigitalMenu`/`ProductsCatalog` fogem do
    padrão de nome = label do menu usado pelos outros componentes
    (`Orders`, `Stock`, `Finance`...).

Itens 9–12 ficam como referência para quando fizer sentido mexer neles —
nenhum é urgente nem afeta o funcionamento atual.
