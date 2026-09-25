'use client';
import { codePointLength } from '@/lib/validation/primitives';
import { templateError, type Values } from './validation';

export function TemplatePreview({ values }: { values: Values }) {
  const template = values.templateBody ?? '';
  const replacements: Record<string, string | undefined> = { first_name: 'Sample', business_name: 'Sample cafe', reward_name: values.targetReward || undefined, public_offer_url: values.offer ? 'https://example.invalid/app/offers/sample' : undefined };
  const missing: string[] = [];
  const rendered = template.replace(/\{\{(first_name|business_name|reward_name|public_offer_url)\}\}/gu, (_, token: string) => {
    if (!replacements[token]) { missing.push(token); return `[missing ${token}]`; }
    return replacements[token]!;
  });
  const error = templateError(template) || (missing.length ? `Select values for: ${[...new Set(missing)].join(', ')}.` : codePointLength(rendered.trim()) < 10 || codePointLength(rendered.trim()) > 1000 ? 'Rendered messages must contain 10–1000 characters.' : '');
  return <aside className="message-preview"><h3>Sample rendered message</h3><p>{rendered || 'Add template text to preview the message.'}</p><p className={error ? 'error-text' : 'microcopy'} role="status">{error || `${codePointLength(rendered.trim())}/1000 characters · Sample only, never sent.`}</p><small>Example name/cafe and a non-deliverable example URL. Missing data excludes a real recipient; text is never truncated.</small></aside>;
}
