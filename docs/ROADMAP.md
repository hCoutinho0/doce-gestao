# Roadmap e pontos de melhoria

O Confeitto é de uso exclusivo do Vitor e da namorada, para organizar a Lavily
Confeitaria. Não será vendido: cobrança, termos de uso, vários clientes no
mesmo banco e afins estão **fora do escopo**. A lista abaixo é para avaliar e
executar conforme a necessidade aparecer, em ordem de importância dentro de
cada bloco. Itens marcados **(você)** dependem de uma ação sua fora do código.

## Já resolvido

- **Dois computadores ao mesmo tempo**: gravação com versão e mescla
  automática (`lib/merge.ts`, `lib/use-painel.ts`). Quem edita ao mesmo tempo
  não apaga o trabalho do outro, e cada tela se atualiza sozinha a cada 30 s.
- **Backup em segundo lugar**: cada backup diário também é copiado para
  `OneDrive\Confeitto\backups`. Para repor: `scripts/restaurar-backup.mjs`.
- **Segurança básica**: trocar a senha no app, `scripts/redefinir-senha.mjs`,
  chaves antigas apagadas do `.env.local` (veja `docs/SEGURANCA.md`).
- **Migração para São Paulo**: script pronto e testado (`docs/MIGRACAO_SAO_PAULO.md`);
  falta você criar o projeto novo e rodar. **(você)**

## A. O que falta fazer **(você)**

1. Criar o projeto Supabase em São Paulo e rodar a migração
   (`docs/MIGRACAO_SAO_PAULO.md`).
2. Revogar as chaves antigas do Azure/Google/WhatsApp e trocar o
   `AUTH_SECRET` do Vercel (`docs/SEGURANCA.md`).
3. O plano grátis do Supabase **pausa o projeto** depois de uns 7 dias sem uso
   (os dados ficam, mas é preciso despausar no painel). Abrir o app pelo menos
   uma vez por semana evita isso; um projeto pago não pausa.
4. As fotos do cardápio ficam no Supabase e **não** entram no backup. Se
   quiser, guarde uma cópia das fotos originais numa pasta.

## B. Segurança — o que ainda vale

5. Conferir no Vercel se `CARDAPIO_ONLY=1` e as chaves do Mercado Pago (se o
   cartão for ativado) estão certas. **(você)**
6. Nunca enviar o `.exe` do instalador (leva a chave do banco).

## C. Velocidade e conforto

7. App no celular (PWA instalável): o manifest já existe; falta o service
   worker e testar a instalação. Útil para a namorada ver pedidos e estoque
   fora do computador.

## D. O que mais ajudaria o dia a dia da confeitaria

8. **Aviso de pedido novo** no painel (som/notificação) quando chega pelo
    cardápio do site.
9. **Relatórios**: lucro real por produto, mais vendidos, vendas por mês,
    exportar para PDF/Excel.
10. **WhatsApp**: mensagem pronta para confirmar pedido, cobrar e avisar
    aniversariantes (link `wa.me`, sem API paga).
11. **Agenda de entregas** (visão semanal) e limite de pedidos por dia.
12. **Pix com QR Code / copia-e-cola** dentro do pedido.
13. **Impressão** de comanda e etiqueta do pedido.
14. Lista de compras mais esperta (sugerir pelo que os pedidos da semana vão
    consumir, conforme as fichas técnicas).

## E. Qualidade do código (só se for mexer muito)

15. Quebrar `app/dashboard/page.tsx` (~5,5 mil linhas) em um arquivo por área.
    Faça depois de ter mais testes.
16. Mais testes: rotas de API e um teste de ponta a ponta (Playwright) para
    pedido → pagamento. O CI já roda tipos, testes e build a cada push.
17. Zerar os avisos antigos do `npm run lint` e atualizar `mercadopago` para a
    versão 3 (só se o cartão for ativado).
