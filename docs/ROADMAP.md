# Roadmap e pontos de melhoria

Lista para você avaliar e executar conforme as demandas aparecerem. Está em
ordem de importância dentro de cada bloco. Itens marcados **(você)** dependem
de uma ação sua fora do código.

## A. Antes de vender para outra confeitaria

1. **A chave secreta do Supabase fica dentro do app instalado.** Ela dá acesso
   a TODO o banco. Com uma confeitaria só, tudo bem; com clientes diferentes
   no mesmo banco, qualquer cliente conseguiria ler os dados dos outros.
   Caminho: o app de desktop passa a abrir o site (Vercel) com login, sem
   nenhuma chave no computador do cliente. É a mudança mais importante e a
   maior. Alternativa pior: um projeto Supabase por cliente.
2. **Cobrança e plano.** Assinatura mensal (Asaas, Mercado Pago ou Stripe),
   período de teste e bloqueio gentil quando não paga. Hoje não existe.
3. **LGPD e termos.** Termos de Uso e Política de Privacidade (revisados por
   advogado), aceite no cadastro, e ferramentas para exportar/apagar os dados
   de um cliente final (o cardápio guarda nome, celular e aniversário de
   clientes das confeitarias).
4. **Banco em produção de verdade.** Projeto Supabase pago, na região de São
   Paulo (hoje cada leitura leva 0,2–0,5 s; ficaria em ~0,05 s), com backup
   gerenciado. O plano grátis pausa por inatividade. **(você)**
5. **Monitoramento de erros** (Sentry ou similar) e aviso quando o site cair.
6. **Domínio de e-mail e suporte**: um canal de suporte e uma página de status.

## B. Segurança e dívidas já conhecidas

7. Apagar e revogar as chaves antigas do `.env.local` (Azure/Google/WhatsApp/
   VAPID) e trocar o `AUTH_SECRET` do Vercel. **(você)**
8. Conferir se o `CARDAPIO_ONLY=1` e as chaves do Mercado Pago estão certos no
   Vercel. **(você)**
9. Recuperação de senha por e-mail (hoje não existe) e troca de senha dentro
   do app.
10. Papel de cada pessoa da equipe: hoje só `admin` e `production`.

## C. Qualidade do código

11. **Gravação com versão.** Hoje o painel grava o documento inteiro; se dois
    computadores editam ao mesmo tempo, vence quem salvar por último. Trocar por
    gravação por item (ou com número de versão e aviso de conflito). A leitura
    inicial já não regrava dados vazios após falha, mas este problema continua.
12. **Quebrar `app/dashboard/page.tsx`** (~5,5 mil linhas) em um arquivo por
    área (Pedidos, Estoque, Financeiro...). Faça depois de ter mais testes.
13. Mais testes: rotas de API com banco de teste e um teste de ponta a ponta
    (Playwright) para o caminho cadastro → pedido → pagamento. O CI já roda
    `tsc`, os testes e o build a cada push.
14. Zerar os avisos antigos do `npm run lint`.
15. Atualizar `mercadopago` para a versão 3 (corrige um aviso moderado do
    `uuid`).

## D. Produto: o que mais agrada confeitaria

16. **Aviso de pedido novo** no painel (som/notificação) quando chega pelo
    cardápio.
17. **Relatórios**: lucro real por produto, mais vendidos, vendas por mês,
    exportar para PDF/Excel.
18. **WhatsApp**: mensagem pronta para confirmar pedido, cobrar e avisar
    aniversariantes (link `wa.me`, sem API paga).
19. **Importar planilha** de estoque e clientes, para quem está migrando.
20. **Impressão** de comanda e etiqueta do pedido.
21. **Agenda de entregas** (visão semanal) e limite de pedidos por dia.
22. **Pix com QR Code** dentro do pedido (copia-e-cola).
23. **Mais de um usuário com papel de entrega**, e foto do pedido pronto.
24. App no celular (PWA instalável): o manifest já existe; falta o service
    worker e testar a instalação.
