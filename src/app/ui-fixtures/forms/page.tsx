import { notFound } from 'next/navigation';
import { ProfileForm } from '../../auth/complete/profile-form';
export const dynamic = 'force-dynamic';

export default function FormFixture() {
  if (process.env.APP_ENV !== 'test' || process.env.VERCEL === '1') notFound();
  return <main id="main" className="auth-wrap"><h1>Local form test fixture</h1>
    <p>UI validation fixture. Browser tests intercept submission failures; this page is unavailable on Vercel.</p>
    <ProfileForm next="/app" />
  </main>;
}
