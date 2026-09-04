export const BAKERY_KEY = 'doce-bakery-profile';

export type BakeryProfile = {
  name: string;
  legalName: string;
  founded: string;
  teamSize: string;
  phone: string;
  city: string;
  specialty: string;
  salesModel: string;
  icon: string;
  logo: string;
  // Shown on the confeitaria's own public link (/c/{bakeryId}) — optional,
  // a button only appears once the field is filled in.
  whatsapp?: string;
  instagram?: string;
  tiktok?: string;
};
