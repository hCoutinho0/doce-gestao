// Impressão de comanda, etiqueta e relatório. Usa um iframe escondido (um
// pop-up seria barrado no aplicativo de desktop e no Safari do iPhone).
import type { Order } from './tipos';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const BASE_CSS = `
  *{box-sizing:border-box} body{font-family:Poppins,Arial,sans-serif;color:#111;margin:0;padding:16px}
  h1{font-size:18px;margin:0 0 2px} h2{font-size:13px;margin:14px 0 4px;text-transform:uppercase;letter-spacing:.04em;color:#555}
  p{margin:2px 0;font-size:13px} table{width:100%;border-collapse:collapse;font-size:13px}
  td,th{padding:4px 6px;text-align:left;border-bottom:1px solid #ddd} .r{text-align:right}
  .box{border:1px dashed #999;padding:8px;border-radius:6px;margin-top:8px}
  @media print{@page{margin:10mm}}
`;

export function imprimirHtml(titulo: string, corpo: string, css = '') {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${BASE_CSS}${css}</style></head><body>${corpo}</body></html>`;
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return;
  }
  const limpar = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener('afterprint', limpar);
  // Imprime quando o conteúdo termina de carregar, com um instante para os estilos assentarem.
  frame.addEventListener('load', () => {
    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(limpar, 60_000);
    }, 150);
  });
  frame.srcdoc = html;
}

const saldoDe = (o: Order) => (o.paymentStatus === 'Pago' ? 0 : Math.max(0, o.value - (o.paidAmount ?? 0)));

export function imprimirComanda(o: Order, confeitaria: string) {
  const itens = o.items?.length
    ? `<table><thead><tr><th>Qtd</th><th>Item</th><th class="r">Valor</th></tr></thead><tbody>${o.items
        .map(
          (i) =>
            `<tr><td>${i.quantity}×</td><td>${esc(i.name)}</td><td class="r">${money(i.quantity * i.unitPrice)}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : `<p>${esc(o.item)}</p>`;
  imprimirHtml(
    `Comanda ${o.id}`,
    `<h1>${esc(confeitaria)}</h1><p>Comanda do pedido <strong>${esc(o.id)}</strong></p>
     <h2>Cliente</h2><p>${esc(o.customer)}${o.phone ? ` — ${esc(o.phone)}` : ''}</p>
     <h2>Entrega</h2><p>${esc(o.date)}</p>
     <h2>Itens</h2>${itens}
     ${o.notes ? `<h2>Observações</h2><div class="box">${esc(o.notes)}</div>` : ''}
     <h2>Pagamento</h2>
     <p>Total: <strong>${money(o.value)}</strong>${o.paymentMethod ? ` (${esc(o.paymentMethod)})` : ''}</p>
     <p>${o.paymentStatus === 'Pago' ? 'Pago' : `Recebido ${money(o.paidAmount ?? 0)} — saldo a receber <strong>${money(saldoDe(o))}</strong>`}</p>`,
  );
}

// Etiqueta pequena (cabe em 80 × 50 mm), uma por pedido.
export function imprimirEtiqueta(o: Order, confeitaria: string) {
  imprimirHtml(
    `Etiqueta ${o.id}`,
    `<div style="border:2px solid #000;border-radius:6px;padding:8px;width:76mm">
       <p style="font-size:11px">${esc(confeitaria)}</p>
       <p style="font-size:20px;font-weight:700">${esc(o.id)} · ${esc(o.customer)}</p>
       <p style="font-size:13px">${esc(o.item)}</p>
       <p style="font-size:12px;margin-top:4px">Entrega: ${esc(o.date)}</p>
       ${saldoDe(o) > 0 ? `<p style="font-size:12px"><strong>Receber: ${money(saldoDe(o))}</strong></p>` : ''}
     </div>`,
    '@media print{@page{size:80mm 50mm;margin:2mm}} body{padding:0}',
  );
}

export function baixarCsv(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
