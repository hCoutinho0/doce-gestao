// Regras de mudança de um pedido (pagamento, sinal, selos e estoque). Sem
// imports: testável.
export type PaymentMethod = 'Pix' | 'Cartão' | 'Dinheiro' | 'Presente';
export type OrderPatch = {
  status?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: 'Pago' | 'Pendente';
  // Valor recebido agora (sinal ou parte do pagamento).
  receive?: number;
};
type PatchableOrder = {
  status: string;
  value: number;
  paymentMethod?: PaymentMethod;
  paymentStatus: 'Pago' | 'Pendente';
  paymentDate?: string;
  // Quanto já foi recebido. Ausente em pedido antigo: vale 0 se pendente e
  // o valor todo se pago.
  paidAmount?: number;
  stampsAwarded?: boolean;
  financeLogged?: boolean;
  stockDeducted?: boolean;
};

export const STAMPS_FOR_DISCOUNT = 10;

// Pedidos abaixo de R$ 100 valem 1 selo, de R$ 100 para cima valem 2 —
// dados uma vez só, quando o pedido é concluído.
export function stampsForValue(value: number): number {
  return value >= 100 ? 2 : 1;
}

export const cents = (n: number) => Math.round(n * 100) / 100;

// Quanto já entrou e quanto falta receber.
export function paidSoFar(o: Pick<PatchableOrder, 'value' | 'paymentStatus' | 'paidAmount'>): number {
  if (o.paymentStatus === 'Pago') return o.value;
  return Math.min(o.value, o.paidAmount ?? 0);
}
export const balanceDue = (o: Pick<PatchableOrder, 'value' | 'paymentStatus' | 'paidAmount'> & { value: number }) =>
  cents(Math.max(0, o.value - paidSoFar(o)));

// Aplica a mudança e diz o que precisa acontecer depois. Cada efeito
// (lançar no Financeiro, dar selo, baixar estoque) dispara uma única vez
// por pedido ou por recebimento, graças aos marcadores
// financeLogged/stampsAwarded/stockDeducted — repetir a chamada não repete.
export function applyOrderPatch<O extends PatchableOrder>(
  target: O,
  patch: OrderPatch,
  today: string,
): {
  next: O;
  shouldLogFinance: boolean;
  // Quanto lançar no Financeiro agora (cada recebimento vira uma entrada).
  financeAmount: number;
  shouldAwardStamps: boolean;
  shouldDeductStock: boolean;
} {
  const status = patch.status?.trim();
  let next: O = { ...target, ...(status ? { status } : {}) };
  let financeAmount = 0;
  let shouldAwardStamps = false;
  let shouldDeductStock = false;
  if (target.paymentStatus !== 'Pago') {
    const due = balanceDue(target);
    let received = 0;
    if (patch.paymentStatus === 'Pago') received = due;
    else if (Number.isFinite(patch.receive) && (patch.receive as number) > 0) {
      received = Math.min(due, cents(patch.receive as number));
    }
    if (received > 0 || patch.paymentStatus === 'Pago') {
      const paid = cents(paidSoFar(target) + received);
      const full = paid >= target.value;
      next = {
        ...next,
        paidAmount: full ? target.value : paid,
        ...(patch.paymentMethod ? { paymentMethod: patch.paymentMethod } : {}),
        ...(full
          ? { paymentStatus: 'Pago' as const, paymentDate: today, financeLogged: true }
          : {}),
      };
      // A venda só conta no Financeiro quando o dinheiro entra.
      // (pedido que já nasceu com financeLogged não lança de novo)
      financeAmount = target.financeLogged && target.paidAmount === undefined ? 0 : received;
    } else if (patch.paymentMethod && !patch.paymentStatus) {
      next = { ...next, paymentMethod: patch.paymentMethod };
    }
  } else if (patch.paymentMethod && !patch.paymentStatus) {
    next = { ...next, paymentMethod: patch.paymentMethod };
  }
  // O selo premia concluir o pedido, não receber por ele.
  if (status === 'Concluído' && !target.stampsAwarded) {
    shouldAwardStamps = true;
    next = { ...next, stampsAwarded: true };
  }
  // O estoque sai quando o pedido é concluído, uma vez só.
  if (status === 'Concluído' && !target.stockDeducted) {
    shouldDeductStock = true;
    next = { ...next, stockDeducted: true };
  }
  return {
    next,
    shouldLogFinance: financeAmount > 0,
    financeAmount,
    shouldAwardStamps,
    shouldDeductStock,
  };
}
