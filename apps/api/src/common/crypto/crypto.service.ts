import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../../config';

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

/** AES-256-GCM. Format: version(1) | iv(12) | tag(16) | ciphertext. */
@Injectable()
export class CryptoService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  encrypt(plain: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.config.encryptionKey, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), body]);
  }

  decrypt(blob: Buffer): Buffer {
    if (blob[0] !== 1) throw new Error('Unsupported ciphertext version');
    const decipher = createDecipheriv('aes-256-gcm', this.config.encryptionKey, blob.subarray(1, 13));
    decipher.setAuthTag(blob.subarray(13, 29));
    return Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]);
  }

  encryptString(plain: string): string {
    return this.encrypt(Buffer.from(plain, 'utf8')).toString('base64');
  }

  decryptString(blob: string): string {
    return this.decrypt(Buffer.from(blob, 'base64')).toString('utf8');
  }
}
