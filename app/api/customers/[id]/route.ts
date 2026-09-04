import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCosmosConfigured, readState, writeState } from '@/lib/cosmos';

type Customer = {
  id: number;
  name: string;
  phone: string;
  birthday?: string;
  stamps: number;
};

const CUSTOMERS_KEY = 'doce-loyalty';

// Same read-modify-write-one-record pattern as /api/orders/[id]: never a
// blind overwrite of the whole list, since the public checkout can also be
// creating/updating a customer record concurrently.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const { id } = await params;
  const body = (await request.json()) as {
    name?: string;
    phone?: string;
    birthday?: string;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }

  const customers = ((await readState<Customer[]>(CUSTOMERS_KEY)) ??
    []) as Customer[];
  const customerId = Number(id);
  const updated = customers.map((customer) =>
    customer.id === customerId
      ? {
          ...customer,
          name: body.name!.trim(),
          phone: body.phone?.trim() ?? customer.phone,
          ...(body.birthday ? { birthday: body.birthday } : {}),
        }
      : customer,
  );
  await writeState(CUSTOMERS_KEY, updated);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const { id } = await params;
  const customerId = Number(id);

  const customers = ((await readState<Customer[]>(CUSTOMERS_KEY)) ??
    []) as Customer[];
  await writeState(
    CUSTOMERS_KEY,
    customers.filter((customer) => customer.id !== customerId),
  );

  return NextResponse.json({ ok: true });
}
