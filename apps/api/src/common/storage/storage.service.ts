import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { APP_CONFIG, AppConfig } from '../../config';
import { CryptoService } from '../crypto/crypto.service';

/** Obyektlar ilova darajasida AES-256-GCM bilan shifrlanib saqlanadi. */
@Injectable()
export class StorageService {
  private s3?: S3Client;
  private bucketReady = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly crypto: CryptoService,
  ) {
    const st = config.storage;
    if (st.driver === 's3') {
      this.s3 = new S3Client({
        endpoint: st.endpoint,
        region: st.region,
        forcePathStyle: true,
        credentials: { accessKeyId: st.accessKey, secretAccessKey: st.secretKey },
      });
    }
  }

  private fsPath(key: string): string {
    const st = this.config.storage;
    if (st.driver !== 'fs') throw new Error('not fs storage');
    const base = resolve(st.dir);
    const full = resolve(join(base, key));
    if (!full.startsWith(base + '/')) throw new Error('Invalid object key');
    return full;
  }

  private async ensureBucket(bucket: string) {
    if (this.bucketReady || !this.s3) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    this.bucketReady = true;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const blob = this.crypto.encrypt(data);
    const st = this.config.storage;
    if (st.driver === 'fs') {
      const path = this.fsPath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, blob, { mode: 0o600 });
      return;
    }
    await this.ensureBucket(st.bucket);
    await this.s3!.send(new PutObjectCommand({ Bucket: st.bucket, Key: key, Body: blob }));
  }

  async get(key: string): Promise<Buffer> {
    const st = this.config.storage;
    let blob: Buffer;
    if (st.driver === 'fs') {
      blob = await readFile(this.fsPath(key));
    } else {
      const res = await this.s3!.send(new GetObjectCommand({ Bucket: st.bucket, Key: key }));
      blob = Buffer.from(await res.Body!.transformToByteArray());
    }
    return this.crypto.decrypt(blob);
  }
}
