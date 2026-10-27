import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDbConfigured, readState } from '@/lib/db';

// Otherwise Next prerenders this metadata once at build time — before any
// bakery has configured its name — and every deploy would ship the same
// frozen title regardless of what's actually in the database.
export const dynamic = 'force-dynamic';

type BakeryProfile = { name?: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bakeryId: string }>;
}): Promise<Metadata> {
  const { bakeryId } = await params;
  const profile = isDbConfigured()
    ? await readState<BakeryProfile>(bakeryId, 'doce-bakery-profile').catch(
        () => null,
      )
    : null;
  const bakeryName = profile?.name || 'Confeitaria';
  const title = `Cardápio | ${bakeryName}`;
  const description = 'Escolha doces artesanais, monte seu carrinho e envie sua encomenda.';

  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: 'summary', title, description, images: [] },
  };
}

// Link de confeitaria que não existe (digitado errado, ou um link antigo
// depois de renomear) dá 404 em vez de um cardápio vazio.
export default async function CardapioLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ bakeryId: string }> }>) {
  if (isDbConfigured()) {
    const { bakeryId } = await params;
    const profile = await readState<BakeryProfile>(bakeryId, 'doce-bakery-profile');
    if (!profile) notFound();
  }
  return children;
}
