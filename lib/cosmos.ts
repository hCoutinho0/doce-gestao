import { CosmosClient, type Container } from '@azure/cosmos';

// Everything the app used to keep in the browser's localStorage — orders,
// stock, finance, menu, loyalty, bakery profile — now lives in one Cosmos DB
// container as small documents, one per domain, so two computers looking at
// the same confeitaria see the same data.
const CONTAINER_ID = 'app-state';

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

export async function readState<T>(key: string): Promise<T | null> {
  const container = await getAppStateContainer();
  // Only a genuine "this document doesn't exist" (404) means null — every
  // caller does `readState(...) ?? []` and then writes that result back, so
  // treating a transient error (timeout, throttling, cold start) the same
  // as "empty" would silently overwrite real data with nothing. That's
  // exactly how a customer's order was wiped in production: a read hiccup
  // right after a deploy came back as null, and the next write persisted
  // an empty array over the real one.
  try {
    const { resource } = await container
      .item(key, key)
      .read<{ id: string; value: T }>();
    return resource?.value ?? null;
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
  }
}

export async function writeState<T>(key: string, value: T): Promise<void> {
  const container = await getAppStateContainer();
  await container.items.upsert({ id: key, value });
}
