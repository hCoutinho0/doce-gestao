import { BlobServiceClient } from '@azure/storage-blob';

const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER || 'cardapio-media';

export function isStorageConfigured(): boolean {
  return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING);
}

export async function uploadImage(
  file: Buffer,
  contentType: string,
  extension: string,
): Promise<string> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error('storage_not_configured');

  const client = BlobServiceClient.fromConnectionString(connectionString);
  const container = client.getContainerClient(CONTAINER_NAME);
  await container.createIfNotExists({ access: 'blob' });

  const blobName = `${crypto.randomUUID()}.${extension}`;
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.uploadData(file, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return blockBlob.url;
}
