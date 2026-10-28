// Regras de mudança de um pedido (pagamento e selos). Sem imports: testável.
export type PaymentMethod = 'Pix' | 'Cartão' | 'Dinheiro' | 'Presente';
export type OrderPatch = {
  status?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: 'Pago' | 'Pendente';
};
type PatchableOrder = {
  status: string;
  paymentMethod?: PaymentMethod;
  paymentStatus: 'Pago' | 'Pendente';
  paymentDate?: string;
  stampsAwarded?: boolean;
  financeLogged?: boolean;
};

export const STAMPS_FOR_DISCOUNT = 10;

// Pedidos abaixo de R$ 100 valem 1 selo, de R$ 100 para cima valem 2 —
// dados uma vez só, quando o pedido é concluído.
export function stampsForValue(value: number): number {
  return value >= 100 ? 2 : 1;
}

// Aplica a mudança e diz o que precisa acontecer depois. Cada efeito
// (lançar no Financeiro, dar selo) dispara uma única vez por pedido, graças
// aos marcadores financeLogged/stampsAwarded — repetir a chamada não repete.
export function applyOrderPatch<O extends PatchableOrder>(
  target: O,
  patch: OrderPatch,
  today: string,
): { next: O; shouldLogFinance: boolean; shouldAwardStamps: boolean } {
  const status = patch.status?.trim();
  let next: O = { ...target, ...(status ? { status } : {}) };
  let shouldLogFinance = false;
  let shouldAwardStamps = false;
  if (patch.paymentStatus === 'Pago' && target.paymentStatus !== 'Pago') {
    next = {
      ...next,
      paymentStatus: 'Pago',
      paymentDate: today,
      ...(patch.paymentMethod ? { paymentMethod: patch.paymentMethod } : {}),
    };
    // A venda só conta no Financeiro quando o cliente paga.
    if (!target.financeLogged) {
      shouldLogFinance = true;
      next = { ...next, financeLogged: true };
    }
  } else if (patch.paymentMethod && !patch.paymentStatus) {
    next = { ...next, paymentMethod: patch.paymentMethod };
  }
  // O selo premia concluir o pedido, não receber por ele.
  if (status === 'Concluído' && !target.stampsAwarded) {
    shouldAwardStamps = true;
    next = { ...next, stampsAwarded: true };
  }
  return { next, shouldLogFinance, shouldAwardStamps };
}
