import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

export type EncryptionKey = { id: string; bytes: Buffer };

export function parseSecretKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('A canonical base64-encoded 32-byte key is required.');
  }
  return key;
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function subjectHmac(key: Buffer, domain: 'ingress-ip' | 'login-email', value: string): string {
  if (key.length !== 32) throw new Error('Invalid HMAC key.');
  return createHmac('sha256', key).update(`loyalty-rate:v1:${domain}\0${value}`, 'utf8').digest('hex');
}

// Node/OpenSSL AES-256-GCM, with separate key IDs and context-bound authenticated data.
export function sealSecret(raw: string, key: EncryptionKey, context: string) {
  if (key.bytes.length !== 32 || !key.id || !context) throw new Error('Invalid encryption configuration.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.bytes, nonce);
  cipher.setAAD(Buffer.from(`loyalty-secret:v1:${key.id}:${context}`, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  return {
    keyId: key.id,
    ciphertext: ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.'),
  };
}

export function openSecret(ciphertext: string, key: EncryptionKey, context: string): string {
  const pieces = ciphertext.split('.');
  if (pieces.length !== 4 || pieces[0] !== 'v1') throw new Error('Invalid encrypted secret.');
  const nonce = Buffer.from(pieces[1]!, 'base64url');
  const tag = Buffer.from(pieces[2]!, 'base64url');
  if (nonce.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted secret.');
  const decipher = createDecipheriv('aes-256-gcm', key.bytes, nonce);
  decipher.setAAD(Buffer.from(`loyalty-secret:v1:${key.id}:${context}`, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(pieces[3]!, 'base64url')), decipher.final()]).toString('utf8');
}
