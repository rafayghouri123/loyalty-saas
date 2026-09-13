import { createGateway } from '../db/gateway';
import { hashToken, parseSecretKey, randomToken, sealSecret } from '../security/crypto';
import { firebaseWebConfig } from './config';
import { z } from 'zod';

let gateway: ReturnType<typeof createGateway> | undefined;
export const challengeResult = z.union([
  z.strictObject({ challengeId: z.uuid(), installationId: z.uuid(), expiresAt: z.string() }),
  z.strictObject({ error: z.strictObject({ code: z.literal('rate_limited'), retryAfterSeconds: z.number().int().positive() }) }),
]);

export function pushRegistrationConfigured() {
  return process.env.PUSH_REGISTRATION_ENABLED === 'true' && !!firebaseWebConfig()
    && !!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY && !!process.env.WEB_GATEWAY_DATABASE_URL
    && !!process.env.ENCRYPTION_KEY_BASE64 && /^[a-zA-Z0-9_-]{1,80}$/u.test(process.env.ENCRYPTION_KEY_ID ?? '');
}

export async function requestPushChallenge(input: { userId: string; sessionId: string; installationId: string; installationSecret: string; token: string }) {
  if (!pushRegistrationConfigured()) throw new Error('Push registration is not configured.');
  gateway ??= createGateway({ connectionString: process.env.WEB_GATEWAY_DATABASE_URL!, ssl: process.env.WEB_GATEWAY_DB_SSL !== 'false',caPath:process.env.DATABASE_CA_CERT_PATH });
  const key = { id: process.env.ENCRYPTION_KEY_ID!, bytes: parseSecretKey(process.env.ENCRYPTION_KEY_BASE64!) };
  const nonce = randomToken();
  const nonceHash = hashToken(nonce), tokenHash = hashToken(input.token);
  return challengeResult.parse(await gateway.requestPushChallenge({ userId: input.userId, sessionId: input.sessionId,
    installationId: input.installationId, installationSecretHash: hashToken(input.installationSecret), tokenHash,
    tokenCiphertext: sealSecret(input.token,key,`push-token:${tokenHash}`).ciphertext, keyId: key.id, nonceHash,
    nonceCiphertext: sealSecret(nonce,key,`push-challenge:${input.installationId}:${nonceHash}`).ciphertext }));
}
