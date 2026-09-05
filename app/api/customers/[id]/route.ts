import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCosmosConfigured, updateStateAtomic } from '@/lib/cosmos';

type Customer = {
  id: number;
  name: string;
  phone: string;
  birthday?: string;
  stamps: number;
};

const CUSTOMERS_KEY = 'doce-loyalty';

// updateStateAtomic, not a plain read-then-write: never a blind overwrite
// of the whole list, since the public checkout can also be creating/
// updating a customer record concurrently — an ETag conflict here retries
// against whatever is current instead of clobbering it.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const bakeryId = session.user.bakeryId;
  const { id } = await params;
  const body = (await request.json()) as {
    name?: string;
    phone?: string;
    birthday?: string;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }
  const customerId = Number(id);

  await updateStateAtomic<Customer[]>(bakeryId, CUSTOMERS_KEY, (current) =>
    (current ?? []).map((customer) =>
      customer.id === customerId
        ? {
            ...customer,
            name: body.name!.trim(),
            phone: body.phone?.trim() ?? customer.phone,
            ...(body.birthday ? { birthday: body.birthday } : {}),
          }
        : customer,
    ),
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const bakeryId = session.user.bakeryId;
  const { id } = await params;
  const customerId = Number(id);

  await updateStateAtomic<Customer[]>(bakeryId, CUSTOMERS_KEY, (current) =>
    (current ?? []).filter((customer) => customer.id !== customerId),
  );

  return NextResponse.json({ ok: true });
}
