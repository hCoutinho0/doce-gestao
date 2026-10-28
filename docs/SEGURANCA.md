# Segurança básica — o que fazer e como

O que já está resolvido no código:

- Senhas guardadas com `bcrypt`; limite de tentativas de login.
- **Alterar minha senha** dentro do app (menu da conta, canto inferior
  esquerdo). Depois da troca, as outras telas abertas dessa conta caem em até
  5 minutos.
- **Esqueceu a senha?** No computador do Confeitto, na pasta do projeto:
  `node scripts/redefinir-senha.mjs email@exemplo.com` (pede a senha nova).
- As chaves antigas do Azure/Google/WhatsApp/VAPID **foram apagadas do
  `.env.local`** (o histórico do GitHub não tinha nenhuma chave real —
  conferido).

## O que só você consegue fazer

### 1. Revogar as chaves antigas (elas ainda valem nos serviços de origem)

Mesmo apagadas do arquivo, as chaves continuam ativas lá. Encerre cada uma:

- **Azure** (portal.azure.com): apague o recurso *Cosmos DB* e o *Storage
  Account* antigos (ou, no mínimo, gere chaves novas em *Keys → Regenerate*) e
  apague o *App Registration* do login Microsoft (*Microsoft Entra ID → App
  registrations*).
- **Google** (console.cloud.google.com → *APIs e serviços → Credenciais*):
  apague o *OAuth client* usado no login com Google.
- **WhatsApp/Meta** (developers.facebook.com): revogue o token de acesso do app
  (*WhatsApp → API Setup* / *System users*) ou apague o app.
- **Web Push (VAPID)**: não precisa de ação; só existia nas chaves apagadas.

### 2. Trocar o `AUTH_SECRET` do Vercel

O valor de exemplo apareceu numa conversa, então troque:

1. Gere um novo, no PowerShell:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Vercel → seu projeto → *Settings → Environment Variables* → edite
   `AUTH_SECRET` (e `NEXTAUTH_SECRET`, se existir) com o valor novo →
   *Redeploy*.

(O app de desktop gera o próprio segredo sozinho, guardado no seu computador.)

### 3. O instalador (`Confeitto-Setup.exe`)

Ele leva a chave do Supabase dentro. **Nunca** envie por e-mail, WhatsApp ou
nuvem pública. Para instalar no computador da namorada, copie por pendrive ou
pelo seu próprio computador e depois apague a cópia.

### 4. Depois da migração para São Paulo

Apagar o projeto Supabase antigo também aposenta a chave antiga (veja
`docs/MIGRACAO_SAO_PAULO.md`).

### 5. Conferir no Vercel

`CARDAPIO_ONLY=1` precisa estar definido (senão o painel inteiro ficaria
acessível no site público). Se for ativar o cartão: `MERCADOPAGO_ACCESS_TOKEN`
e `MERCADOPAGO_WEBHOOK_SECRET`.
