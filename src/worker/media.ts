import sharp from 'sharp';
import type pg from 'pg';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

export type MediaStorage = {
  download(path: string): Promise<Uint8Array>;
  upload(bucket: string, path: string, data: Uint8Array): Promise<void>;
  removeOriginal(path: string): Promise<void>;
};
const jobSchema = z.object({ id: z.uuid(), businessId: z.uuid(), kind: z.enum(['logo', 'cover', 'offer', 'payment_proof']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), bytes: z.string(), originalPath: z.string(), outputPath: z.string(), expired: z.boolean(), visibility: z.enum(['public_brand', 'private']) });

export async function sanitizeImage(input: Uint8Array, mime: string, kind: string) {
  if (!input.length || input.length > 5 * 1024 * 1024) throw new Error('invalid_image');
  const pipeline = sharp(input, { limitInputPixels: 20_000_000, failOn: 'warning', animated: false });
  const metadata = await pipeline.metadata();
  const mimes: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const actual = mimes[metadata.format ?? ''];
  if (actual !== mime || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1
    || metadata.width * metadata.height > 20_000_000 || metadata.width * metadata.height * 4 / input.length > 1000) throw new Error('invalid_image');
  const maximum = kind === 'logo' ? 512 : kind === 'payment_proof' ? 2000 : 1600;
  const output = await pipeline.rotate().resize({ width: maximum, height: maximum, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  if (output.data.length > 3 * 1024 * 1024) throw new Error('invalid_image');
  return output;
}

export async function validateMedia(pool: pg.Pool, outboxId: string, storage: MediaStorage) {
  const result = await pool.query('select public.worker_media_job($1) as job', [outboxId]);
  if (!result.rows[0]?.job) return;
  const job = jobSchema.parse(result.rows[0].job);
  if (job.expired) { await pool.query('select public.worker_finish_media($1,false,null,null,null)', [outboxId]); return; }
  // Storage/network failures retry. Invalid bytes produce a durable rejection.
  const input = await storage.download(job.originalPath);
  let output;
  try {
    if (BigInt(input.length) !== BigInt(job.bytes)) throw new Error('invalid_image');
    output = await sanitizeImage(input, job.mimeType, job.kind);
  } catch { await pool.query('select public.worker_finish_media($1,false,null,null,null)', [outboxId]); return; }
  await storage.upload(job.visibility === 'private' ? 'loyalty-private' : 'loyalty-brand', job.outputPath, output.data);
  await pool.query('select public.worker_finish_media($1,true,$2,$3,$4)', [outboxId, output.data.length, output.info.width, output.info.height]);
}

export async function purgeMedia(pool: pg.Pool, storage: MediaStorage) {
  const result = await pool.query('select public.worker_expired_media() as items');
  const items = z.array(z.object({ assetId: z.uuid(), path: z.string() })).parse(result.rows[0]?.items);
  for (const item of items) { await storage.removeOriginal(item.path); await pool.query('select public.worker_mark_media_purged($1)', [item.assetId]); }
}

export function supabaseMediaStorage(url: string, key: string): MediaStorage {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async download(path) {
      const { data, error } = await client.storage.from('loyalty-quarantine').download(path);
      if (error || !data || data.size > 5 * 1024 * 1024) throw new Error('storage_unavailable');
      return new Uint8Array(await data.arrayBuffer());
    },
    async upload(bucket, path, data) {
      const { error } = await client.storage.from(bucket).upload(path, data, { contentType: 'image/webp', cacheControl: bucket === 'loyalty-brand' ? '31536000' : '0', upsert: false });
      // A crash after upload can retry the same immutable path. Check existing bytes.
      if (error) {
        const { data: previous, error: readError } = await client.storage.from(bucket).download(path);
        if (readError || !previous || previous.size !== data.byteLength || !Buffer.from(await previous.arrayBuffer()).equals(Buffer.from(data))) throw new Error('storage_unavailable');
      }
    },
    async removeOriginal(path) { const { error } = await client.storage.from('loyalty-quarantine').remove([path]); if (error) throw new Error('storage_unavailable'); },
  };
}
