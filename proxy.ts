import { auth } from '@/auth';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

// O painel (/dashboard, /configurar) só abre com sessão válida — decidido
// aqui, a partir do cookie assinado pelo NextAuth, nunca de algo editável no
// navegador. Conta sem confeitaria vai para /cadastro. O cardápio público de
// cada confeitaria fica em /{confeitaria}.
//
// CARDAPIO_ONLY=1 desliga tudo isso e deixa só o cardápio no ar (login,
// cadastro, painel e as demais APIs dão 404): é a proteção para um site que
// ainda não deve expor o painel.

const panelGuard = auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.nextUrl.origin));
  }
  if (req.auth?.user?.needsOnboarding) {
    return NextResponse.redirect(new URL('/cadastro', req.nextUrl.origin));
  }
});

// Caminhos do app que nunca são o nome de uma confeitaria.
const RESERVED = new Set([
  'api',
  'cadastro',
  'cardapio',
  'configurar',
  'dashboard',
  'login',
  'assets',
]);

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

function notFound() {
  return new NextResponse('Página não encontrada', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// /{confeitaria} abre direto o cardápio (sem mudar o endereço na barra) e o
// endereço antigo /{confeitaria}/cardapio vira o curto. Devolve null quando o
// caminho não é de uma confeitaria.
function cardapioRoute(req: NextRequest): NextResponse | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const slug = parts[0]?.toLowerCase() ?? '';
  if (RESERVED.has(slug) || !SLUG.test(slug)) return null;
  if (parts.length === 1) {
    const url = req.nextUrl.clone();
    url.pathname = `/${slug}/cardapio`;
    return NextResponse.rewrite(url);
  }
  if (parts.length === 2 && parts[1] === 'cardapio') {
    const url = req.nextUrl.clone();
    url.pathname = `/${slug}`;
    return NextResponse.redirect(url, 308);
  }
  return null;
}

function cardapioOnly(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // O que o cardápio precisa da API: ler o cardápio publicado e a marca da
  // confeitaria, mandar o pedido, pagar pelo Mercado Pago e mostrar fotos.
  if (pathname.startsWith('/api/')) {
    const allowed =
      (method === 'GET' &&
        (pathname === '/api/data/doce-menu' ||
          pathname === '/api/data/doce-bakery-profile' ||
          pathname === '/api/data/doce-menu-periodo' ||
          // Celular já cadastrado? (só primeiro nome e selos)
          pathname === '/api/customers/lookup' ||
          pathname.startsWith('/api/media/'))) ||
      (method === 'POST' &&
        (pathname === '/api/orders' ||
          // Mercado Pago: a preferência lê o pedido do banco (o preço nunca
          // vem do navegador) e o webhook confere a assinatura do MP.
          pathname === '/api/checkout/preference' ||
          pathname === '/api/checkout/webhook'));
    return allowed ? NextResponse.next() : notFound();
  }

  if (pathname === '/') {
    const fallback = process.env.CARDAPIO_PADRAO?.trim();
    return fallback ? NextResponse.redirect(new URL(`/${fallback}`, req.url)) : notFound();
  }
  return cardapioRoute(req) ?? notFound();
}

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (process.env.CARDAPIO_ONLY === '1') return cardapioOnly(req);
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/configurar')) {
    return (panelGuard as unknown as (r: NextRequest, e: NextFetchEvent) => Response)(req, event);
  }
  return cardapioRoute(req) ?? NextResponse.next();
}

export const config = {
  // Tudo, menos os arquivos estáticos do Next e os ícones/imagens públicos.
  matcher: ['/((?!_next/static|_next/image|favicon\\.svg|favicon\\.ico|assets/).*)'],
};
