import Image from 'next/image';
import Link from 'next/link';
import { CakeSlice, Camera, MessageCircle, Music2, Settings2 } from 'lucide-react';
import { isCosmosConfigured, readState } from '@/lib/cosmos';

// Otherwise Next prerenders the bakery name/logo once at build time and
// every deploy ships that frozen snapshot regardless of what's actually
// configured later in /configurar.
export const dynamic = 'force-dynamic';

type BakeryProfile = { name?: string; logo?: string; icon?: string };

// Real numbers/handles only — never a placeholder link dressed up as real.
// Leave empty to hide a button until the confeitaria actually has one.
const WHATSAPP_NUMBER: string = '5511953026659';
const INSTAGRAM_HANDLE: string = 'lavilyconfeitaria';
const TIKTOK_HANDLE: string = '';

type HubLink = {
  href: string;
  label: string;
  icon: typeof CakeSlice;
  external: boolean;
};

const links: HubLink[] = [
  {
    href: '/cardapio',
    label: 'Ver cardápio e fazer pedido',
    icon: CakeSlice,
    external: false,
  },
];
if (WHATSAPP_NUMBER) {
  links.push({
    href: `https://wa.me/${WHATSAPP_NUMBER}`,
    label: 'Chamar no WhatsApp',
    icon: MessageCircle,
    external: true,
  });
}
if (INSTAGRAM_HANDLE) {
  links.push({
    href: `https://instagram.com/${INSTAGRAM_HANDLE}`,
    label: `@${INSTAGRAM_HANDLE} no Instagram`,
    icon: Camera,
    external: true,
  });
}
if (TIKTOK_HANDLE) {
  links.push({
    href: `https://tiktok.com/@${TIKTOK_HANDLE}`,
    label: `@${TIKTOK_HANDLE} no TikTok`,
    icon: Music2,
    external: true,
  });
}

export default async function LinkHubPage() {
  const bakery = isCosmosConfigured()
    ? await readState<BakeryProfile>('doce-bakery-profile').catch(() => null)
    : null;

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-5 py-16 text-foreground">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-20 place-items-center overflow-hidden rounded-3xl bg-primary text-3xl text-primary-foreground shadow-lg">
            {bakery?.logo ? (
              <Image
                src={bakery.logo}
                alt={`Logotipo de ${bakery.name ?? 'Lavily Confeitaria'}`}
                width={80}
                height={80}
                unoptimized
                className="size-full object-cover"
              />
            ) : bakery?.icon ? (
              bakery.icon
            ) : (
              <CakeSlice className="size-8" />
            )}
          </span>
          <h1 className="mt-5 font-heading text-2xl font-bold">
            {bakery?.name || 'Lavily Confeitaria'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Doces artesanais feitos com carinho
          </p>
        </div>

        <div className="mt-9 space-y-3">
          {links.map(({ href, label, icon: Icon, external }) => (
            <Link
              key={href}
              href={href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-4 font-medium shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <Icon className="size-5 shrink-0 text-primary" />
              {label}
            </Link>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/painel"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <Settings2 className="size-3.5" /> Entrar no painel
          </Link>
        </div>
      </div>
    </main>
  );
}
