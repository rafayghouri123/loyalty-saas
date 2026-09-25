import { copy } from '@/lib/copy';
export default function Loading() {
  return <main id="main" className="container" aria-busy="true"><section className="state-panel">
    <p role="status">{copy.pageState.loading}</p>
  </section></main>;
}
