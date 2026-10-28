// Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central). Sem
// imports: testável.
const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

// Sem acento, só o que o padrão aceita; corta no tamanho máximo do campo.
const limpa = (s: string, max: number) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .\-_/]/g, '')
    .trim()
    .slice(0, max);

export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function pixPayload(opts: {
  chave: string;
  nome: string;
  cidade: string;
  valor?: number;
  txid?: string;
}): string {
  const conta = tlv('00', 'br.gov.bcb.pix') + tlv('01', opts.chave.trim());
  const valor = opts.valor && opts.valor > 0 ? tlv('54', opts.valor.toFixed(2)) : '';
  const txid = (opts.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const base =
    tlv('00', '01') +
    tlv('26', conta) +
    tlv('52', '0000') +
    tlv('53', '986') +
    valor +
    tlv('58', 'BR') +
    tlv('59', limpa(opts.nome, 25) || 'CONFEITARIA') +
    tlv('60', limpa(opts.cidade, 15) || 'BRASIL') +
    tlv('62', tlv('05', txid)) +
    '6304';
  return base + crc16(base);
}
