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
  const { resource } = await container
    .item(key, key)
    .read<{ id: string; value: T }>()
    .catch(() => ({ resource: undefined }));
  return resource?.value ?? null;
}

export async function writeState<T>(key: string, value: T): Promise<void> {
  const container = await getAppStateContainer();
  await container.items.upsert({ id: key, value });
}
