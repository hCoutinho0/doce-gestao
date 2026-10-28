// Formatos dos dados do painel (pedidos, estoque, receitas...).
export type OrderItem = { name: string; quantity: number; unitPrice: number };

export type Order = {
  id: string;
  customer: string;
  customerId?: number;
  phone?: string;
  items?: OrderItem[];
  item: string;
  notes?: string;
  orderDate?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  date: string;
  value: number;
  status: string;
  paymentMethod?: 'Pix' | 'Cartão' | 'Dinheiro' | 'Presente';
  paymentStatus: 'Pago' | 'Pendente';
  paymentDate?: string;
  // Quanto já foi recebido (sinal ou parcelas); ausente = 0 se pendente.
  paidAmount?: number;
  stampsAwarded?: boolean;
  financeLogged?: boolean;
  // O estoque já foi baixado quando o pedido foi concluído.
  stockDeducted?: boolean;
};

// `cost` é sempre o preço por `unit` (uma unidade/pacote comprado) — o
// formulário de cadastro pede "valor pago" e calcula esse preço unitário na
// hora, não pede o valor por unidade diretamente. `weight` é opcional e só
// existe em ingredientes: o peso de UM pacote/unidade comprado (ex.: uma
// lata de leite condensado com 395g) — é o que permite uma linha de receita
// dizer "usei 200g disso" e cobrar só a fração correspondente do valor
// pago, em vez do pacote inteiro.
export type StockItem = {
  id: number;
  name: string;
  qty: number;
  unit: string;
  min: number;
  cost: number;
  category?: 'Ingrediente' | 'Embalagem';
  weight?: { value: number; unit: 'g' | 'kg' };
  // Onde foi comprado da última vez — só controle de fornecedor/reposição,
  // não entra em nenhum cálculo de custo.
  supplier?: string;
  // Validade (yyyy-mm-dd) do lote em estoque, opcional.
  expiry?: string;
};

// Lista de compras (Estoque): compartilhada por todos da confeitaria.
// stockId liga o item ao estoque (para mostrar onde costuma ser comprado e
// não sugerir de novo o que já está na lista); itens avulsos não têm.
export type ShoppingItem = {
  id: number;
  name: string;
  qty: string;
  stockId?: number;
  done: boolean;
  createdAt: string;
};

export type FinanceItem = {
  id: number;
  description: string;
  type: 'Entrada' | 'Saída';
  category?: string;
  value: number;
  date: string;
};

export type MenuItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  available: boolean;
  emoji: string;
  // Sabor, mostrado como subtítulo no cardápio ("Brownie" / "Pistache").
  flavor?: string;
  photoUrl?: string;
  weight?: { value: number; unit: 'kg' | 'g' | 'l' };
  // Marca de qual item do catálogo (Produtos) este veio, quando publicado
  // por lá — evita publicar o mesmo produto duas vezes. É uma cópia, não
  // um vínculo: editar o produto depois não atualiza o item já publicado.
  sourceProductId?: number;
};

// A simple named product + flavor, independent of the weekly cardápio —
// meant for things like custom cakes that aren't part of a given week's
// published menu but still need to show up when building a pedido.
// Período a que o cardápio publicado se refere (aparece no topo do
// cardápio do cliente). Guardado à parte do perfil para ser lido sem login.
export type MenuPeriod = { from: string; to?: string } | null;

export type Product = {
  id: number;
  name: string;
  flavor: string;
  price?: number;
  weight?: { value: number; unit: 'g' | 'kg' | 'ml' | 'l' | 'unidade' };
  photoUrl?: string;
};

// `unit` é a unidade em que ESSA linha da receita foi medida — pode ser
// diferente da unidade em que o item foi comprado no estoque. É o que
// permite comprar um pacote de 395g e usar só 200g numa receita.
export type RecipeLine = {
  id: number;
  stockId: number;
  quantity: number;
  unit: 'un' | 'g' | 'kg';
};

// Uma receita é uma entidade própria — não depende de já existir um
// produto no cardápio ou em Produtos para ser criada. `productId`/
// `productKind` só aparecem quando ela foi vinculada a um item real (na
// criação, opcionalmente, ou depois via "Precificar produto"); uma receita
// avulsa não tem nenhum dos dois. `id` é a chave própria da receita —
// receitas salvas antes desse campo existir não têm `id`, só `productId`
// (sempre presente nelas, já que só dava pra criar vinculado); nesse caso
// `productId` também serve de `id`, ver `recipeKey`.
export type ProductRecipe = {
  id?: number;
  productId?: number;
  productKind?: 'menu' | 'catalog';
  productName?: string;
  yieldCount: number;
  recipeItems: RecipeLine[];
  // Único percentual de custos fixos/variáveis (aluguel, embalagem
  // avulsa, marketing...), aplicado sobre ingredientes+embalagens da
  // receita — substitui a antiga lista de "gastos invisíveis" nomeados.
  overheadPercent: number;
  profit: number;
  // Taxa única de cartão/iFood — substitui os antigos cardFee+tax
  // separados.
  feePercent: number;
  // Preço de venda: começa igual à sugestão (custo + margem), mas o
  // usuário pode digitar um valor diferente (ex.: arredondar) — uma vez
  // editado, para de seguir a sugestão automaticamente.
  sellPrice?: number;
  // Adicional cobrado fora da precificação (ex.: embalagem especial sob
  // pedido) — soma só no preço final, não entra na distribuição de lucro.
  extraCharge?: number;
  // Como o "lucro disponível" (preço de venda − custo total) se divide.
  proLaborePercent?: number;
  companyPercent?: number;
  // Vendido por peso (ex.: bolo confeitado por kg) em vez de por unidade —
  // muda o preço sugerido de "por unidade" para "por kg".
  soldByWeight?: boolean;
  // Perda de peso ao assar/cozinhar, opcional — reduz o peso final da
  // receita antes de calcular o preço por kg (a água evapora, o peso cru
  // não é o peso vendido).
  weightLossPercent?: number;
};

export type LoyaltyItem = {
  id: number;
  name: string;
  phone: string;
  birthday?: string;
  stamps: number;
};


// Perda registrada no estoque (vencido, caiu, estragou...).
export type Perda = {
  id: number;
  date: string;
  stockId: number;
  name: string;
  qty: number;
  unit: string;
  // Custo da perda no momento (quantidade × custo unitário).
  cost: number;
  reason: string;
};

// Ajustes da confeitaria (só administradores leem e gravam).
export type Ajustes = {
  // Máximo de pedidos por dia de entrega; o cardápio público recusa acima.
  dailyLimit?: number;
  pixKey?: string;
  pixName?: string;
  pixCity?: string;
};
