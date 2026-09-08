import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  constants,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import jwt from 'jsonwebtoken';

@Injectable()
export class RsaService {
  private readonly privateKey: ReturnType<typeof createPrivateKey>;

  private readonly publicKey: ReturnType<typeof createPublicKey>;

  private readonly publicKeyBase64: string;

  constructor(private readonly config: ConfigService) {
    const privatePath = resolve(
      this.config.get<string>('RSA_PRIVATE_KEY_PATH', 'keys/private.pem') ?? 'keys/private.pem',
    );
    const publicPath = resolve(
      this.config.get<string>('RSA_PUBLIC_KEY_PATH', 'keys/public.pem') ?? 'keys/public.pem',
    );
    this.ensureKeyPair(privatePath, publicPath);
    this.privateKey = createPrivateKey(readFileSync(privatePath, 'utf8'));
    this.publicKey = createPublicKey(readFileSync(publicPath, 'utf8'));
    this.publicKeyBase64 = this.publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('base64');
  }

  private ensureKeyPair(privatePath: string, publicPath: string): void {
    if (existsSync(privatePath) && existsSync(publicPath)) {
      return;
    }
    mkdirSync(dirname(privatePath), { recursive: true });
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    writeFileSync(privatePath, privateKey, { encoding: 'utf8', mode: 0o600 });
    writeFileSync(publicPath, publicKey, { encoding: 'utf8', mode: 0o644 });
  }

  decrypt(encryptedBase64: string): string {
    return privateDecrypt(
      {
        key: this.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encryptedBase64, 'base64'),
    ).toString('utf8');
  }

  sign(payload: object, expiresInSeconds: number, jwtid?: string): string {
    const options: {
      algorithm: 'RS256';
      expiresIn: number;
      jwtid?: string;
    } = {
      algorithm: 'RS256',
      expiresIn: expiresInSeconds,
    };
    if (jwtid !== undefined) {
      options.jwtid = jwtid;
    }
    return jwt.sign(payload, this.privateKey, options);
  }

  verify<T extends object>(token: string): T {
    const decoded = jwt.verify(token, this.publicKey, {
      algorithms: ['RS256'],
    });
    if (typeof decoded === 'string') {
      throw new Error('invalid token payload');
    }
    return decoded as T;
  }

  getPublicKeyBase64(): string {
    return this.publicKeyBase64;
  }
}
