# Roadmap e pontos de melhoria

O Confeitto é de uso exclusivo do Vitor e da namorada, para organizar a Lavily
Confeitaria. Não será vendido: cobrança, termos de uso, vários clientes no
mesmo banco e afins estão **fora do escopo**. Itens marcados **(você)** dependem
de uma ação sua fora do código.

## Já resolvido

- **Dois computadores ao mesmo tempo**: gravação com versão e mescla
  automática (`lib/merge.ts`, `lib/use-painel.ts`).
- **Backup em segundo lugar** (OneDrive) e **segurança básica** (trocar senha,
  `scripts/redefinir-senha.mjs`, `docs/SEGURANCA.md`).
- **Migração para São Paulo** concluída (projeto "Confeitto SP").
- **Painel também no site** (Vercel, região São Paulo) para o iPhone; o app de
  Windows continua completo (`docs/ARQUITETURA.md`).
- **Estoque baixa sozinho** quando o pedido é concluído (pela ficha técnica).
- **Sinal e pagamento parcial**: cada recebimento entra no Financeiro; saldo a
  receber aparece no pedido.
- **Agenda de entregas** (semana) e **limite de pedidos por dia** (Ajustes).
- **Aviso de pedido novo** (som e faixa, com o app aberto).
- **WhatsApp**: confirmar, cobrar saldo, avisar que está pronto e parabenizar
  aniversariantes (links wa.me).
- **Impressão** de comanda e etiqueta do pedido.
- **Relatórios**: vendas por mês, ticket médio, produtos com lucro, perdas;
  exportar para Excel (CSV) e PDF.
- **Pix com QR Code e copia e cola** no recebimento (chave em Ajustes).
- **Lista de compras pelos pedidos da semana**.
- **Validade** dos ingredientes e **registro de perdas**.
- **App para iPhone (PWA)**: manifest, service worker, tela cheia e campos
  ajustados para o Safari.
- Código do painel começou a ser separado (`lib/tipos.ts`, `lib/custos.ts`,
  `components/*`); sobram as telas antigas dentro de `app/dashboard/page.tsx`.

## O que falta fazer **(você)**

1. **Trocar o `AUTH_SECRET` do Vercel** e, para usar o painel no iPhone, apagar a
   variável `CARDAPIO_ONLY` (passo a passo em `docs/SEGURANCA.md`).
2. Revogar as chaves antigas do Azure/Google/WhatsApp (`docs/SEGURANCA.md`).
3. Preencher em **Ajustes** a chave Pix e o limite de pedidos por dia.
4. Plano grátis do Supabase **pausa** após ~7 dias sem uso: abrir o app ao
   menos uma vez por semana. As fotos do cardápio não entram no backup.
5. Antes de vender: Vercel Hobby é só para uso não comercial (plano Pro), e
   `ALLOW_SIGNUP=1` abre o cadastro de confeitarias novas.

## Ideias que ainda não foram feitas

- **Aviso com a tela bloqueada** no iPhone (Web Push): precisa de chaves VAPID e
  de um envio a partir do servidor quando o pedido chega.
- Dar baixa também em receita "vendida por peso" (hoje o pedido conta unidades).
- Desfazer a baixa de estoque se um pedido concluído for reaberto.
- Quebrar o resto de `app/dashboard/page.tsx` em um arquivo por área
  (Pedidos, Estoque, Precificação, Financeiro, Cardápio...).
- Mais testes: rotas de API e um teste de ponta a ponta (Playwright) no CI.
- Zerar os avisos antigos do `npm run lint`; atualizar `mercadopago` para a
  versão 3 só se o cartão for ativado.
