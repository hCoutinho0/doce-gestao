# Como o Confeitto funciona hoje

```
 iPhone (Safari / tela de início) ─┐
 Windows (app Confeitto, "casca")  ├──►  Site no Vercel (gru1, São Paulo)  ──►  Supabase (São Paulo)
 Navegador de qualquer lugar      ─┘     painel + cardápio + APIs              dados + fotos
                                          (guarda as chaves)
```

**Ninguém leva chave do banco.** Só o site (Vercel) conhece a
`SUPABASE_SERVICE_KEY`; o aplicativo de Windows, o iPhone e o navegador falam
com o site, e o site fala com o banco. Quem usa precisa apenas de **e-mail e
senha**.

## Três peças

| Peça | O que é | Como atualiza |
| --- | --- | --- |
| **Site / painel** | O mesmo código Next.js: painel (`/dashboard`), cardápio público (`/{confeitaria}`) e as APIs. | `git push` na `main` → a Vercel publica sozinha em ~1 min. Quem está com o painel aberto vê o aviso **"Nova versão disponível"** (`components/aviso-versao.tsx`, compara o commit via `/api/versao`) e atualiza com um toque. |
| **App de Windows** | Uma janela (Electron) que abre `https://www.confeitto.com.br/dashboard`. Sem servidor, sem banco, sem chave. Faz o **backup diário** (`%APPDATA%\Confeitto\backups` + OneDrive), o **lembrete de tarefas** e a atualização da própria janela. | Quase nunca precisa: o painel é o site. Se a janela mudar: `npm run publicar:casca` (os apps se atualizam sozinhos). O instalador só muda se o Electron mudar. |
| **iPhone** | O mesmo site, instalado pelo Safari (Compartilhar → Adicionar à Tela de Início), em tela cheia (PWA). | Igual ao site. |

## Quem entra na confeitaria

- A Lavily já existe no banco. Pessoas novas entram por **código de convite**
  (Equipe → gerar convite → a pessoa usa em `/cadastro` → "Entrar numa
  confeitaria"): a conta nova já nasce ligada à Lavily e só adiciona dados nela.
- Criar uma confeitaria **nova** fica fechado por padrão (`ALLOW_SIGNUP` não
  definido). Para abrir (por exemplo, no dia em que o sistema for vendido):
  `ALLOW_SIGNUP=1` no Vercel.
- Cada confeitaria enxerga só os próprios dados: todo documento é
  `{confeitaria}:{chave}` e as rotas usam a confeitaria da sessão.

## Variáveis do Vercel

| Nome | Para quê |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Banco (só no servidor) |
| `AUTH_SECRET` | Assina as sessões (texto aleatório longo; troque para derrubar todas) |
| `NEXTAUTH_URL` | Opcional (o site já confia no Host da Vercel) |
| `ALLOW_SIGNUP` | `1` abre o cadastro de confeitarias novas (padrão: fechado) |
| `CARDAPIO_ONLY` | `1` deixa **só o cardápio** no ar (painel e login dão 404). Não definir = painel no ar |
| `MERCADOPAGO_*` | Cartão (ainda desligado) |
| `CARDAPIO_PADRAO` | Opcional: confeitaria para a raiz do domínio |

`vercel.json` fixa a região `gru1` (São Paulo), ao lado do Supabase.

## Limites a lembrar

- **Vercel Hobby** é gratuito só para uso **não comercial**. Para vender o
  sistema, é preciso o plano Pro.
- **Supabase gratuito** pausa depois de ~7 dias sem uso.
- Sem internet, o painel não abre (o app de Windows e o iPhone mostram "sem
  conexão"). O backup diário fica no computador.

## Para quem desenvolve

```powershell
npm install
copy .env.example .env.local   # SUPABASE_URL, SUPABASE_SERVICE_KEY, AUTH_SECRET, ALLOW_SIGNUP=1
npm run dev                    # http://localhost:3000  (cuidado: usa o banco do .env.local)
npm test && npx tsc --noEmit   # o CI também roda o build
npm run desktop:abrir          # abre a janela do Windows apontando para o site
```

Scripts de manutenção (usam a chave do `.env.local`, só neste computador):
`scripts/redefinir-senha.mjs`, `scripts/restaurar-backup.mjs`,
`scripts/renomear-confeitaria.mjs`.
