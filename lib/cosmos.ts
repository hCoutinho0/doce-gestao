import { CosmosClient, type Container } from '@azure/cosmos';

// Everything the app used to keep in the browser's localStorage — orders,
// stock, finance, menu, loyalty, bakery profile — now lives in one Cosmos DB
// container as small documents, one per domain per confeitaria, so two
// computers looking at the same confeitaria see the same data, and two
// different confeitarias never see each other's.
const CONTAINER_ID = 'app-state';

// The one confeitaria that existed before multi-tenancy. Its domain
// documents were written without any bakeryId prefix (just `doce-orders`,
// `doce-bakery-profile`, etc.) — readState falls back to those unprefixed
// keys for this bakeryId only, so nothing needed a manual migration. Also
// the bakeryId auto-assigned to Microsoft/Entra ID logins that carry one
// of the two Lavily-specific App Roles (see auth.ts).
export const LAVILY_BAKERY_ID = 'lavily';

let containerPromise: Promise<Container> | null = null;

export function isCosmosConfigured(): boolean {
  return Boolean(
    process.env.AZURE_COSMOS_ENDPOINT && process.env.AZURE_COSMOS_KEY,
  );
}

export function getAppStateContainer(): Promise<Container> {
  if (!isCosmosConfigured()) {
    throw new Error('cosmos_not_configured');
  }
  if (!containerPromise) {
    containerPromise = (async () => {
      const client = new CosmosClient({
        endpoint: process.env.AZURE_COSMOS_ENDPOINT!,
        key: process.env.AZURE_COSMOS_KEY!,
      });
      const { database } = await client.databases.createIfNotExists({
        id: process.env.AZURE_COSMOS_DATABASE || 'doce-gestao',
      });
      const { container } = await database.containers.createIfNotExists({
        id: CONTAINER_ID,
        partitionKey: { paths: ['/id'] },
      });
      return container;
    })();
  }
  return containerPromise;
}

async function readDoc<T>(id: string): Promise<T | null> {
  const container = await getAppStateContainer();
  // Only a genuine "this document doesn't exist" (404) means null — every
  // caller does `readDoc(...) ?? []` and then writes that result back, so
  // treating a transient error (timeout, throttling, cold start) the same
  // as "empty" would silently overwrite real data with nothing. That's
  // exactly how a customer's order was wiped in production: a read hiccup
  // right after a deploy came back as null, and the next write persisted
  // an empty array over the real one.
  try {
    const { resource } = await container
      .item(id, id)
      .read<{ id: string; value: T }>();
    return resource?.value ?? null;
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
  }
}

async function writeDoc<T>(id: string, value: T): Promise<void> {
  const container = await getAppStateContainer();
  await container.items.upsert({ id, value });
}

// Documents that exist outside any confeitaria — today just `user:{email}`
// account records, used to look up which bakeryId a login belongs to
// before we know which confeitaria's data to read.
export function readGlobal<T>(id: string): Promise<T | null> {
  return readDoc<T>(id);
}

export function writeGlobal<T>(id: string, value: T): Promise<void> {
  return writeDoc(id, value);
}

export async function readState<T>(
  bakeryId: string,
  key: string,
): Promise<T | null> {
  const scopedId = `${bakeryId}:${key}`;
  const value = await readDoc<T>(scopedId);
  if (value !== null) return value;
  if (bakeryId === LAVILY_BAKERY_ID) {
    const legacy = await readDoc<T>(key);
    if (legacy !== null) {
      await writeDoc(scopedId, legacy);
      return legacy;
    }
  }
  return null;
}

export async function writeState<T>(
  bakeryId: string,
  key: string,
  value: T,
): Promise<void> {
  await writeDoc(`${bakeryId}:${key}`, value);
}

async function readDocWithEtag<T>(
  id: string,
): Promise<{ value: T | null; etag: string | null }> {
  const container = await getAppStateContainer();
  try {
    const { resource } = await container
      .item(id, id)
      .read<{ id: string; value: T; _etag?: string }>();
    return { value: resource?.value ?? null, etag: resource?._etag ?? null };
  } catch (error) {
    if ((error as { code?: number }).code === 404) return { value: null, etag: null };
    throw error;
  }
}

// A plain readState-then-writeState is a read-modify-write with no
// isolation — two requests racing (two customers checking out at the same
// instant, both bumping the same order counter or appending to the same
// loyalty list) can both read the same starting point and one silently
// clobbers the other's change on write. This does the same read-modify-
// write, but guarded by the document's ETag: the write only succeeds if
// nobody else changed it in between, and on a conflict (412 — someone else
// won the race; 409 — someone else created it first) it just re-reads the
// now-current value and retries `update` against that. Used for every
// state document more than one request can plausibly touch at once.
export async function updateStateAtomic<T>(
  bakeryId: string,
  key: string,
  update: (current: T | null) => T,
  maxAttempts = 5,
): Promise<T> {
  const container = await getAppStateContainer();
  const id = `${bakeryId}:${key}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { value, etag } = await readDocWithEtag<T>(id);
    // Same legacy fallback readState relies on — an old Lavily document
    // saved without the bakeryId prefix still needs to be picked up the
    // first time this key is written under the new scoped id.
    const current =
      value === null && bakeryId === LAVILY_BAKERY_ID
        ? await readDoc<T>(key)
        : value;
    const next = update(current);
    try {
      if (etag) {
        await container
          .item(id, id)
          .replace(
            { id, value: next },
            { accessCondition: { type: 'IfMatch', condition: etag } },
          );
      } else {
        await container.items.create({ id, value: next });
      }
      return next;
    } catch (error) {
      const code = (error as { code?: number }).code;
      if ((code === 412 || code === 409) && attempt < maxAttempts) continue;
      throw error;
    }
  }
  throw new Error('update_conflict_retries_exhausted');
}

// The only reads that aren't a point-read-by-id — used sparingly (today
// just listing a confeitaria's invites), since it's a cross-partition
// query rather than a single-document lookup.
export async function queryDocs<T>(
  sqlQuery: string,
  parameters: { name: string; value: string }[] = [],
): Promise<T[]> {
  const docs = await queryDocsWithIds<T>(sqlQuery, parameters);
  return docs.map((d) => d.value);
}

// Same as queryDocs, but keeps the document id — needed when the id
// itself carries information (here, the bakeryId prefix of a
// `{bakeryId}:doce-tasks` document), not just its value.
export async function queryDocsWithIds<T>(
  sqlQuery: string,
  parameters: { name: string; value: string }[] = [],
): Promise<{ id: string; value: T }[]> {
  const container = await getAppStateContainer();
  const { resources } = await container.items
    .query<{ id: string; value: T }>({ query: sqlQuery, parameters })
    .fetchAll();
  return resources;
}
