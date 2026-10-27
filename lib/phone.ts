// Celular brasileiro: DDD (11–99, sem zero) + 9 + 8 dígitos. Aceita com ou
// sem +55, espaços, parênteses e traço. Devolve só os 11 dígitos, ou null
// se não for um celular válido. É a "chave" que identifica o cliente: o
// mesmo celular nunca vira dois cadastros, mesmo com o nome escrito de
// outro jeito.
export function normalizePhone(raw: string | undefined | null): string | null {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 11) return null;
  if (!/^[1-9][1-9]9\d{8}$/.test(digits)) return null;
  return digits;
}

// (11) 91234-5678 — também serve de máscara enquanto a pessoa digita.
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// "Maria Aparecida Alves" -> "Maria A." — o suficiente para a pessoa se
// reconhecer no cardápio sem expor o nome completo a quem digitar um
// número qualquer.
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase()}.`;
}
