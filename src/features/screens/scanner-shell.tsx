'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ScannerShell({ intent = false }: { intent?: boolean }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), generation = useRef(0);
  const [state, setState] = useState('Ready to scan. Camera access starts only when you tap Scan.');
  const [running, setRunning] = useState(false), [pending, setPending] = useState(false);
  function stop() { generation.current++; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setRunning(false); setPending(false); }
  useEffect(() => () => { generation.current++; stream.current?.getTracks().forEach(track => track.stop()); }, []);
  async function scan() {
    if (!navigator.onLine) { setState('Offline. Reconnect before customer lookup or fulfillment.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState('Camera is unavailable in this browser. Use the customer code on a secure connection.'); return; }
    const attempt = ++generation.current;
    setPending(true);
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
      if (attempt !== generation.current) { camera.getTracks().forEach(track => track.stop()); return; }
      stream.current = camera;
      if (video.current) { video.current.srcObject = camera; await video.current.play(); }
      setRunning(true); setState('Camera preview only. QR decoding and authorized lookup connect in Phase 3. No customer has been selected.');
    } catch (error) {
      if (attempt !== generation.current) return;
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      const name = error instanceof DOMException ? error.name : '';
      setState(name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access in browser settings, or enter the customer code.' : name === 'NotFoundError' ? 'No camera found. Enter the customer code instead.' : 'Camera could not start. Close other camera apps and retry, or use the customer code.');
    } finally { if (attempt === generation.current) setPending(false); }
  }
  return <section className="scanner-panel" aria-label="Camera scanner"><div className="scanner-view"><video ref={video} muted playsInline aria-label="Camera preview" hidden={!running} />{!running && <QrCode size={72} aria-hidden="true" />}</div><p role="status">{state}</p><div className="actions"><Button disabled={pending || running} onClick={scan}><Camera size={18} aria-hidden="true" />{pending ? 'Requesting camera…' : intent ? 'Scan customer intent' : 'Scan customer QR'}</Button>{(running || pending) && <Button variant="secondary" onClick={() => { stop(); setState('Camera stopped. You can use the customer code.'); }}>Stop camera</Button>}<Button variant="secondary" onClick={() => document.getElementById(intent ? 'intentCode' : 'lookupCode')?.focus()}>Enter customer code</Button></div></section>;
}
