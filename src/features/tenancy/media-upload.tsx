'use client';
import { createBrowserClient } from '@supabase/ssr';
import { useState } from 'react';
import { getPublicConfig } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { mutate } from './mutate';

export function MediaUpload({ businessId, rowVersion, kind, onAccepted }: { businessId: string; rowVersion?: number;
  kind: 'logo' | 'cover' | 'offer'; onAccepted?: (assetId:string)=>void }) {
  const [status, setStatus] = useState(''), [assetId, setAssetId] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [file,setFile]=useState<File|null>(null);
  return <section className="screen-panel"><h2>{kind === 'logo' ? 'Logo' : kind==='cover'?'Cover':'Offer or campaign'} image</h2><p>JPEG, PNG or WebP, up to 5 MiB and 20 megapixels. Upload is private until worker validation finishes.</p>
    <div><label className="field">Image file<input name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setFile(event.target.files?.[0]??null)}/></label>
    <Button type="button" disabled={pending||!file} onClick={async () => { if (!file) return;
      setPending(true); setError(''); setStatus('Uploading');
      try {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5242880) throw new Error('Choose a supported image up to 5 MiB.');
        const config = getPublicConfig(); if (!config) throw new Error('Storage needs configuration.');
        const grant = await mutate('/api/tenancy/reserve-media', { businessId, kind, mimeType: file.type, bytes: file.size });
        setAssetId(String(grant.assetId));
        const client = createBrowserClient(config.supabaseUrl, config.supabaseKey);
        const result = await client.storage.from(String(grant.bucket)).upload(String(grant.path), file, { contentType: file.type, upsert: false });
        if (result.error) throw new Error('Upload failed. Retry with your current verified owner session.');
        await mutate('/api/tenancy/submit-media', { assetId: grant.assetId }); setStatus('Processing');
      } catch (err) { setError((err as Error).message); setStatus('Upload incomplete'); } finally { setPending(false); }
    }}>Upload {kind}</Button></div>
    {status && <p role="status">{status}</p>}
    {assetId && <Button disabled={pending} variant="secondary" onClick={async () => { setPending(true); setError(''); try { const result = await mutate('/api/tenancy/media-status', { assetId }); setStatus(result.status === 'accepted' ? 'Accepted' : result.status === 'rejected' ? 'Rejected' : 'Processing'); } catch (err) { setError((err as Error).message); } finally { setPending(false); } }}>Refresh processing status</Button>}
    {status === 'Accepted' && <Button type="button" disabled={pending} onClick={async () => { setPending(true); setError(''); try {
      if(kind==='offer'){onAccepted?.(assetId);setStatus('Image ready. Save the draft to use it.');setPending(false);return;}
      await mutate('/api/tenancy/attach-media', { businessId, assetId, rowVersion }); window.location.reload();
    } catch (err) { setError((err as Error).message); setPending(false); } }}>Use this {kind}</Button>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}
