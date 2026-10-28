// Gerado a partir de 03_Interface_Icons da identidade visual. Traço em
// currentColor: a cor vem do texto do botão (cacau/roxo no estado ativo).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export function IconeVisaoGeral(props: P) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>
    </svg>
  );
}

export function IconePedidos(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M5 7h14l-1 13H6L5 7Z"/><path d="M8 7a4 4 0 0 1 8 0"/>
    </svg>
  );
}

export function IconeEstoque(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 7 9 5 9-5M3 12l9 5 9-5M3 17l9 5 9-5"/>
    </svg>
  );
}

export function IconePrecificacao(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2l2 2.2 3-.3.9 2.9 2.7 1.4-.9 2.9 1.7 2.5-2.3 2 .3 3-3 .8-1.4 2.7-2.8-1-2.5 1.8-2-2.3-3 .3-.8-3-2.7-1.4 1-2.8-1.8-2.5 2.3-2-.3-3 3-.8L10 4.2 12 2Z"/><path d="M14.5 8.5h-4a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4h-4M12 6.5v12"/>
    </svg>
  );
}

export function IconeFinanceiro(props: P) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9"/><path d="M15 8.5h-4a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4h-4M12 6.5v12"/>
    </svg>
  );
}

export function IconeCardapio(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 7V4M10 4h4"/><path d="M7 15h10"/>
    </svg>
  );
}

export function IconeProdutos(props: P) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3V2h6v1M9 8h6M9 12h6M9 16h4"/>
    </svg>
  );
}

export function IconeClientes(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

export function IconeFidelidade(props: P) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8H7.5a2.5 2.5 0 1 1 2.5-2.5L12 8Zm0 0h4.5A2.5 2.5 0 1 0 14 5.5L12 8Z"/>
    </svg>
  );
}

export function IconeEquipe(props: P) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M19 8v6M16 11h6"/>
    </svg>
  );
}
