# Segurança — o que está feito e o que só você faz

## Como o acesso é protegido

- **A chave do banco** (`SUPABASE_SERVICE_KEY`) está no Vercel, no `.env.local` e **dentro do
  instalador do app de Windows**. O iPhone e o navegador usam o site e não a levam.
  Por isso o instalador só vai para quem usa o app, por canal privado.
- **Login:** senhas com `bcrypt`; limite de tentativas **por e-mail** (10 em 15
  min) e **por IP** (60 em 15 min); sessão assinada (JWT) que expira em 30 dias
  sem uso e é reconferida a cada 5 minutos (conta removida, papel mudado ou
  senha trocada derrubam a sessão).
- **Cada confeitaria vê só o que é dela:** todo documento é
  `{confeitaria}:{chave}` e as rotas usam a confeitaria da sessão, nunca algo
  vindo do navegador. A conta "Produção" não lê nem grava Financeiro, Caixa,
  Precificação, Produtos, Clientes, Fidelidade nem Ajustes (conferido no
  servidor, não só na tela).
- **Cadastro de confeitaria nova está fechado** (`ALLOW_SIGNUP`). Pessoas novas
  entram por convite (código de uso único gerado por um administrador).
- **Backup e lembretes** (`/api/backup`, `/api/reminders/daily`) exigem login e
  devolvem só a própria confeitaria (o backup, só para administrador).
- **Upload de fotos** só logado. Só PNG/JPEG/WebP, conferidos pela assinatura do
  arquivo, até 4 MB (SVG é recusado de propósito).
- **Cardápio público:** pedido entra sempre como "Novo/Pendente" com o preço
  calculado no servidor; limites de uso por IP; só o cardápio e a vitrine da
  confeitaria (nome, logo, cidade, redes) saem sem login.
- **Banco:** a tabela `app_state` tem RLS ligado e nenhuma política (só a chave
  secreta acessa). Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options,
  nosniff) em `next.config.ts`.

## O que só você consegue fazer

### 1. Trocar o `AUTH_SECRET` do Vercel

O valor antigo apareceu numa conversa. Gere um novo e cole no Vercel
(*Settings → Environment Variables → AUTH_SECRET → Edit*), depois **Redeploy**.
Todo mundo precisa entrar de novo (esperado).

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2. Chave secreta do Supabase — quando trocar

Não precisa trocar agora (ela só está no seu PC, no Vercel e no instalador 2.x que
você gerou). Troque se o `.exe`, o `.env.local` ou o `config.json` saírem do seu controle (PC
perdido, instalador enviado por canal público, repositório com a chave):

1. Supabase → *Project Settings → API Keys → Secret keys → New secret key*.
2. Coloque a nova em `SUPABASE_SERVICE_KEY` no **Vercel** (Redeploy) e no `.env.local`.
3. **Apague a chave antiga** e gere/publique o app de Windows de novo
   (`publicar-atualizacao.bat`; instalador novo só para PCs novos).

### 3. Projeto antigo do Supabase

O projeto Supabase **antigo** (EUA) deve ser apagado uns 7 dias depois de tudo estável
(*Project Settings → General → Delete project*).

### 4. Hábitos

- Senhas fortes e diferentes por pessoa; remova a conta de quem sai da equipe
  (Equipe) — a sessão dela cai em até 5 minutos.
- Nunca cole chave, senha ou código de convite em conversas, e-mails ou no
  GitHub (o repositório é público).
- Esqueceu a senha: `node scripts/redefinir-senha.mjs email@exemplo.com`
  (no computador de quem desenvolve; pede a senha nova na hora).
