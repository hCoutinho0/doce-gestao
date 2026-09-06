import type { Metadata } from 'next';
import { isCosmosConfigured, readState } from '@/lib/cosmos';

// Otherwise Next prerenders this metadata once at build time — before any
// bakery has configured its name — and every deploy would ship the same
// frozen title regardless of what's actually in Cosmos DB.
export const dynamic = 'force-dynamic';

type BakeryProfile = { name?: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bakeryId: string }>;
}): Promise<Metadata> {
  const { bakeryId } = await params;
  const profile = isCosmosConfigured()
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

export default function CardapioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
