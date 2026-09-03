import { redirect } from 'next/navigation';

// The public menu moved to the site root so a bare domain (e.g.
// lavilyconfeitaria.com.br) shows the storefront customers expect. Old
// links to /cardapio still work.
export default function CardapioRedirect() {
  redirect('/');
}
