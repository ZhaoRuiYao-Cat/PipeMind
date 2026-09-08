import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

@Injectable()
export class AiSecretService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const fromEnv = this.config.get<string>('AI_SECRET_KEY', '');
    if (fromEnv.trim().length > 0) {
      this.key = createHash('sha256').update(fromEnv.trim()).digest();
      return;
    }
    const keyPath = resolve(
      this.config.get<string>('AI_SECRET_KEY_PATH', 'keys/ai-secret.key') ??
        'keys/ai-secret.key',
    );
    if (!existsSync(keyPath)) {
      const raw = randomBytes(32);
      writeFileSync(keyPath, raw, { mode: 0o600 });
    }
    this.key = readFileSync(keyPath);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    if (tag.length !== TAG_LENGTH) {
      throw new InternalServerErrorException('密钥加密失败');
    }
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException('密钥密文格式非法');
    }
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      throw new InternalServerErrorException('密钥密文格式非法');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return `${key.slice(0, 2)}****`;
  }
  return `${key.slice(0, 6)}****${key.slice(-4)}`;
}
