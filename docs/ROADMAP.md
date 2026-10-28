# Roadmap e pontos de melhoria

O Confeitto é de uso exclusivo do Vitor e da namorada, para organizar a Lavily
Confeitaria. Não será vendido: cobrança, termos de uso, vários clientes no
mesmo banco e afins estão **fora do escopo**. A lista abaixo é para avaliar e
executar conforme a necessidade aparecer, em ordem de importância dentro de
cada bloco. Itens marcados **(você)** dependem de uma ação sua fora do código.

## A. Não perder dados

1. **Dois computadores editando ao mesmo tempo.** O painel grava o documento
   inteiro; se vocês dois mexem no mesmo assunto (estoque, financeiro...) ao
   mesmo tempo, vence quem salvar por último e a outra alteração some. É o
   risco mais real para duas pessoas. Solução: gravar por item, ou com número
   de versão e aviso de conflito. (A leitura inicial já não regrava dados
   vazios depois de uma falha.)
2. **Backup em um segundo lugar.** O backup diário fica só em
   `%APPDATA%\Confeitto\backups`, no mesmo PC. Copiar essa pasta para o
   OneDrive/Google Drive de vez em quando. O plano grátis do Supabase não tem
   backup próprio. **(você)**
3. **Plano grátis do Supabase pausa o projeto** depois de uns 7 dias sem uso.
   Os dados ficam, mas é preciso "despausar" no painel do Supabase. Abrir o
   app pelo menos uma vez por semana evita isso. **(você)**

## B. Segurança básica

4. Apagar e revogar as chaves antigas do `.env.local` (Azure/Google/WhatsApp/
   VAPID) e trocar o `AUTH_SECRET` do Vercel. **(você)**
5. **Nunca publicar nem compartilhar o `.exe` do instalador**: ele leva a chave
   do Supabase embutida. Para instalar no computador da namorada, use a pasta
   do instalador direto do seu PC, sem enviar por e-mail ou nuvem pública.
   **(você)**
6. Recuperação de senha: hoje não existe. Anote a senha das duas contas num
   lugar seguro, ou peça aqui para criar uma forma de redefinir.
7. Conferir no Vercel se `CARDAPIO_ONLY=1` e as chaves do Mercado Pago (se o
   cartão for ativado) estão certas. **(você)**

## C. Velocidade e conforto

8. **Supabase na região de São Paulo.** Hoje cada leitura leva 0,2–0,5 s
   (projeto longe do Brasil). Em São Paulo ficaria em ~0,05 s e o app abriria
   e salvaria bem mais rápido. Exige criar um projeto novo e migrar os dados
   (dá para fazer com o backup). **(você decide; eu ajudo na migração)**
9. App no celular (PWA instalável): o manifest já existe; falta o service
   worker e testar a instalação. Útil para a namorada ver pedidos e estoque
   fora do computador.

## D. O que mais ajudaria o dia a dia da confeitaria

10. **Aviso de pedido novo** no painel (som/notificação) quando chega pelo
    cardápio do site.
11. **Relatórios**: lucro real por produto, mais vendidos, vendas por mês,
    exportar para PDF/Excel.
12. **WhatsApp**: mensagem pronta para confirmar pedido, cobrar e avisar
    aniversariantes (link `wa.me`, sem API paga).
13. **Agenda de entregas** (visão semanal) e limite de pedidos por dia.
14. **Pix com QR Code / copia-e-cola** dentro do pedido.
15. **Impressão** de comanda e etiqueta do pedido.
16. Lista de compras mais esperta (sugerir pelo que os pedidos da semana vão
    consumir, conforme as fichas técnicas).

## E. Qualidade do código (só se for mexer muito)

17. Quebrar `app/dashboard/page.tsx` (~5,5 mil linhas) em um arquivo por área.
    Faça depois de ter mais testes.
18. Mais testes: rotas de API e um teste de ponta a ponta (Playwright) para
    pedido → pagamento. O CI já roda tipos, testes e build a cada push.
19. Zerar os avisos antigos do `npm run lint` e atualizar `mercadopago` para a
    versão 3 (só se o cartão for ativado).
