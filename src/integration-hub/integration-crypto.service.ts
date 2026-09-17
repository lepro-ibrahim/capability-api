import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

@Injectable()
export class IntegrationCryptoService {
  private key(): Buffer {
    const source = (
      process.env.INTEGRATIONS_ENCRYPTION_KEY ?? process.env.JWT_SECRET
    )?.trim();
    if (!source || source.length < 32) {
      throw new ServiceUnavailableException(
        'Le chiffrement des intégrations doit être configuré.',
      );
    }
    return createHash('sha256').update(source).digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  decrypt(payload: string): string {
    const [ivRaw, tagRaw, encryptedRaw] = payload.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) {
      throw new ServiceUnavailableException('Secret d’intégration illisible.');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
