import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * The object-store boundary. In this slice, only image variants and
 * originals cross it (spec §11.1). A test double stands in for tests — a
 * real upload requires a real S3-compatible endpoint, which is exactly the
 * kind of external dependency this codebase's own logic (resizing, EXIF
 * stripping, key layout) should be tested independently of.
 */
export interface ObjectStorage {
  putPublic(key: string, body: Buffer, contentType: string): Promise<string>;
  putPrivate(key: string, body: Buffer, contentType: string): Promise<void>;
}

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putPublic(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
      }),
    );
    return `${this.config.publicBaseUrl}/${key}`;
  }

  async putPrivate(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}
