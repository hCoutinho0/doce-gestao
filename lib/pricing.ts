// Preço de um pedido a partir do cardápio. Sem imports: fica testável direto.
export type MenuItem = { name: string; flavor?: string; price: number; available: boolean };
export type OrderItem = { name: string; quantity: number; unitPrice: number };
export type RequestedItem = { name: string; quantity: number; unitPrice?: number };

// Nome do item como aparece no pedido: "Brownie — Pistache" quando o item
// do cardápio tem sabor. É o que identifica o item (dois brownies de
// sabores diferentes são itens diferentes).
export const menuLabel = (m: MenuItem) =>
  m.flavor?.trim() ? `${m.name} — ${m.flavor.trim()}` : m.name;

// O preço vem SEMPRE do cardápio, nunca do que o navegador mandar — senão
// qualquer pessoa pediria por 1 centavo. Duas exceções, só para quem está
// logado no painel: `fromEdition` (cardápio de uma semana antiga aceita
// itens já indisponíveis) e `unitPrice` informado à mão, para item que não
// está em nenhum cardápio. Devolve null se algum item for inválido.
export function priceFromMenu(
  menu: MenuItem[],
  requested: RequestedItem[],
  opts: { isAuthenticated: boolean; fromEdition: boolean },
): { items: OrderItem[]; value: number } | null {
  const items: OrderItem[] = [];
  for (const request of requested) {
    if (!Number.isFinite(request.quantity) || request.quantity <= 0) return null;
    if (
      opts.isAuthenticated &&
      Number.isFinite(request.unitPrice) &&
      (request.unitPrice as number) > 0
    ) {
      items.push({
        name: request.name.trim(),
        quantity: request.quantity,
        unitPrice: request.unitPrice as number,
      });
      continue;
    }
    const wanted = request.name.trim().toLowerCase();
    const orderable = (m: MenuItem) => opts.fromEdition || m.available;
    const match =
      menu.find((m) => orderable(m) && menuLabel(m).trim().toLowerCase() === wanted) ??
      menu.find((m) => orderable(m) && !m.flavor && m.name.trim().toLowerCase() === wanted);
    if (!match) return null;
    items.push({ name: menuLabel(match), quantity: request.quantity, unitPrice: match.price });
  }
  const value = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return { items, value };
}
