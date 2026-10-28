// Mensagens prontas e link wa.me (sem API paga). Sem imports: testável.
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Celular de 11 dígitos (DDD + número) vira o link com o código do Brasil.
export function waLink(phone: string | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const full = digits.length === 11 || digits.length === 10 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

type Pedido = {
  id: string;
  customer: string;
  item: string;
  date: string;
  value: number;
  paidAmount?: number;
  paymentStatus: string;
};
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;
const saldo = (o: Pedido) => (o.paymentStatus === 'Pago' ? 0 : Math.max(0, o.value - (o.paidAmount ?? 0)));

export type ModeloMensagem = 'confirmar' | 'cobrar' | 'pronto';
export const MODELOS: { id: ModeloMensagem; rotulo: string }[] = [
  { id: 'confirmar', rotulo: 'Confirmar pedido' },
  { id: 'cobrar', rotulo: 'Cobrar saldo' },
  { id: 'pronto', rotulo: 'Avisar que está pronto' },
];

export function mensagemPedido(modelo: ModeloMensagem, o: Pedido, confeitaria: string): string {
  const nome = primeiroNome(o.customer);
  if (modelo === 'confirmar') {
    return `Oi, ${nome}! Aqui é da ${confeitaria}. Seu pedido ${o.id} está confirmado: ${o.item}. Entrega: ${o.date}. Total: ${money(o.value)}.${
      saldo(o) > 0 ? ` Falta pagar ${money(saldo(o))}.` : ''
    } Obrigada!`;
  }
  if (modelo === 'cobrar') {
    return `Oi, ${nome}! Passando para lembrar do saldo de ${money(saldo(o))} do pedido ${o.id} (${o.date}). Qualquer dúvida é só chamar. Obrigada!`;
  }
  return `Oi, ${nome}! Seu pedido ${o.id} da ${confeitaria} está pronto. ${saldo(o) > 0 ? `Falta pagar ${money(saldo(o))}. ` : ''}Combinamos a retirada/entrega?`;
}

export const mensagemAniversario = (nome: string, confeitaria: string) =>
  `Oi, ${primeiroNome(nome)}! Feliz aniversário! 🎂 A ${confeitaria} deseja um dia doce. Se quiser um bolo ou docinhos para comemorar, é só chamar!`;
