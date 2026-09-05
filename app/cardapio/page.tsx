import { redirect } from 'next/navigation';
import { LAVILY_BAKERY_ID } from '@/lib/cosmos';

// Compatibility redirect — this used to BE the (Lavily-only) public
// cardápio. Now every confeitaria has its own at /{bakeryId}/cardapio,
// but links already shared before this change (the WhatsApp bot,
// printed QR codes) still point here, so it forwards to Lavily's own
// page instead of 404ing, preserving any query string (Mercado Pago's
// back_urls use ?pedido=...&status=...).
export default async function LegacyCardapioRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') query.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
  }
  const qs = query.toString();
  redirect(`/${LAVILY_BAKERY_ID}/cardapio${qs ? `?${qs}` : ''}`);
}
