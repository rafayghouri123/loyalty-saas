import QRCode from 'qrcode';
import sharp from 'sharp';

const xml = (text: string) => text.replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
export function signupDestination(origin: string, slug: string, branch: string) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('HTTPS origin required');
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/u.test(slug) || !/^[0-9a-f-]{36}$/iu.test(branch)) throw new Error('Invalid destination');
  const url = new URL(`/join/${slug}`, base.origin);
  url.searchParams.set('branch', branch);
  return url.toString();
}
export async function signupArtwork(input: { destination: string; cafe: string; branch: string; proposition: string }, format: 'svg' | 'png') {
  const qr = QRCode.create(input.destination, { errorCorrectionLevel: 'M' });
  const cell = 500 / (qr.modules.size + 8);
  const modules: string[] = [];
  for (let y = 0; y < qr.modules.size; y++) for (let x = 0; x < qr.modules.size; x++) {
    if (qr.modules.get(y, x)) modules.push(`M${x + 4},${y + 4}h1v1h-1z`);
  }
  const lines = (text: string, y: number, size: number, max = 48) => {
    const points = [...text]; const output: string[] = [];
    for (let i = 0; i < points.length; i += max) output.push(`<text x="400" y="${y + output.length * (size + 7)}" text-anchor="middle" font-size="${size}">${xml(points.slice(i, i + max).join(''))}</text>`);
    return output.join('');
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 800 1120"><rect width="800" height="1120" fill="white"/><g fill="#111827" font-family="sans-serif">${lines(input.cafe, 60, 28)}${lines(input.branch, 145, 20)}${lines(input.proposition, 220, 20)}<text x="400" y="330" text-anchor="middle" font-size="26">Scan to join our loyalty programme</text><g transform="translate(150,360) scale(${cell})" shape-rendering="crispEdges"><path d="${modules.join('')}" fill="black"/></g>${lines(input.destination, 905, 15, 65)}<text x="400" y="1050" text-anchor="middle" font-size="18">Sign in, review the terms, and join.</text><text x="400" y="1080" text-anchor="middle" font-size="16">No app installation required.</text></g></svg>`;
  return format === 'svg' ? Buffer.from(svg) : sharp(Buffer.from(svg)).png().toBuffer();
}
