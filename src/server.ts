import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { RealGoogleAuthProvider } from './auth/googleProvider.js';
import { createDb } from './db/index.js';
import { S3ObjectStorage } from './contestants/storage.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.databaseUrl);
  const google = new RealGoogleAuthProvider(config.google.clientId, config.google.clientSecret);
  const storage = new S3ObjectStorage(config.s3);

  const app = await buildApp({ db, google, storage, config });
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
