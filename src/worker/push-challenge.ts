import type pg from 'pg';
import { z } from 'zod';
import { hashToken, openSecret, type EncryptionKey } from '../lib/security/crypto.js';

const challenge = z.strictObject({ challengeId: z.uuid(), installationId: z.uuid(), expiresAt: z.string(),
  nonceCiphertext: z.string(), nonceKeyId: z.string(), nonceHash: z.string(), tokenCiphertext: z.string(), tokenKeyId: z.string(), tokenHash: z.string() });
export type ChallengeMessage = { token: string; challengeId: string; installationId: string; nonce: string; ttlSeconds: number };
export type ChallengeSender = { key: (id: string) => EncryptionKey; send: (message: ChallengeMessage) => Promise<void> };

export async function dispatchPushChallenge(pool: pg.Pool, outboxId: string, sender: ChallengeSender) {
  const result = await pool.query('select public.worker_claim_push_challenge($1) as candidate',[outboxId]);
  if (!result.rows[0]?.candidate) return;
  const input = challenge.parse(result.rows[0].candidate);
  let state = 'failed';
  try {
    const token = openSecret(input.tokenCiphertext,sender.key(input.tokenKeyId),`push-token:${input.tokenHash}`);
    const nonce = openSecret(input.nonceCiphertext,sender.key(input.nonceKeyId),`push-challenge:${input.installationId}:${input.nonceHash}`);
    if (hashToken(token) !== input.tokenHash || hashToken(nonce) !== input.nonceHash) throw new Error('Invalid challenge.');
    const ttlSeconds = Math.min(300,Math.floor((Date.parse(input.expiresAt)-Date.now())/1000));
    if (ttlSeconds > 0) {
      state = 'unknown';
      await sender.send({ token, nonce, challengeId: input.challengeId, installationId: input.installationId, ttlSeconds });
      state = 'provider_accepted';
    }
  } catch { /* Persist only safe state. A network timeout is ambiguous, never delivery proof. */ }
  await pool.query('select public.worker_finish_push_challenge($1,$2)',[input.challengeId,state]);
}
