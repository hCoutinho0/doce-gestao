import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CakeSlice, Camera, MessageCircle, Music2, Settings2 } from 'lucide-react';
import { isDbConfigured, readState } from '@/lib/db';
import type { BakeryProfile } from '@/lib/bakery';

// Every confeitaria's own link-in-bio page — /{bakeryId}. Lavily's is
// just another confeitaria here, same as any created through /cadastro
// or a convite.
export const dynamic = 'force-dynamic';

type HubLink = {
  href: string;
  label: string;
  icon: typeof CakeSlice;
  external: boolean;
};

export default async function BakeryLinkHubPage({
  params,
}: {
  params: Promise<{ bakeryId: string }>;
}) {
  const { bakeryId } = await params;
  const bakery = isDbConfigured()
    ? await readState<BakeryProfile>(bakeryId, 'doce-bakery-profile').catch(
        () => null,
      )
    : null;

  if (!bakery) notFound();

  const links: HubLink[] = [
    {
      href: `/${bakeryId}/cardapio`,
      label: 'Ver cardápio e fazer pedido',
      icon: CakeSlice,
      external: false,
    },
  ];
  if (bakery.whatsapp) {
    links.push({
      href: `https://wa.me/${bakery.whatsapp}`,
      label: 'Chamar no WhatsApp',
      icon: MessageCircle,
      external: true,
    });
  }
  if (bakery.instagram) {
    links.push({
      href: `https://instagram.com/${bakery.instagram}`,
      label: `@${bakery.instagram} no Instagram`,
      icon: Camera,
      external: true,
    });
  }
  if (bakery.tiktok) {
    links.push({
      href: `https://tiktok.com/@${bakery.tiktok}`,
      label: `@${bakery.tiktok} no TikTok`,
      icon: Music2,
      external: true,
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-5 py-16 text-foreground">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-20 place-items-center overflow-hidden rounded-3xl bg-primary text-3xl text-primary-foreground shadow-lg">
            {bakery.logo ? (
              <Image
                src={bakery.logo}
                alt={`Logotipo de ${bakery.name}`}
                width={80}
                height={80}
                unoptimized
                className="size-full object-cover"
              />
            ) : bakery.icon ? (
              bakery.icon
            ) : (
              <CakeSlice className="size-8" />
            )}
          </span>
          <h1 className="mt-5 font-heading text-2xl font-bold">
            {bakery.name}
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
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <Settings2 className="size-3.5" /> Entrar no painel
          </Link>
        </div>
      </div>
    </main>
  );
}
