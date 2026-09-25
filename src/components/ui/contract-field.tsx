'use client';
import { type Field } from '@/features/screens/contracts';
import { codePointLength } from '@/lib/validation/primitives';

export function ContractField({ field, value, onChange, error, disabled = false }: { field: Field; value: string; onChange: (value: string) => void; error?: string; disabled?: boolean }) {
  const { id, label, kind = 'text', required, help } = field;
  const describedBy = [`${id}-help`, error ? `${id}-error` : ''].filter(Boolean).join(' ');
  const common = { id, name: id, disabled: disabled || Boolean(field.disabled), required, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy };
  const helper = field.disabled || help || (kind === 'file' ? 'JPEG, PNG or WebP up to 5 MiB. Uploading → Processing → Accepted / Rejected. Only accepted assets may publish.' : kind === 'money' ? 'Rs · Up to two decimal places.' : ['time', 'datetime-local'].includes(kind) ? 'Asia/Karachi · 24-hour time.' : required ? 'Required' : 'Optional');
  const labelText = <>{label}{required && <span className="microcopy"> (required)</span>}</>;
  const options = field.options ?? [];
  return <div className={`field ${kind === 'checkbox' ? 'checkbox-field' : ''}`}>
    {kind !== 'multi' && kind !== 'checkbox' && <label htmlFor={id}>{labelText}</label>}
    {kind === 'checkbox' ? <label htmlFor={id}><input {...common} type="checkbox" checked={value === 'true'} onChange={event => onChange(String(event.target.checked))} />{labelText}</label> : kind === 'textarea' ? <textarea {...common} value={value} rows={4} onChange={event => onChange(event.target.value)} /> : kind === 'select' ? <select {...common} value={value} onChange={event => onChange(event.target.value)}><option value="">Choose an option</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select> : kind === 'multi' ? <fieldset disabled={common.disabled} aria-describedby={describedBy} aria-invalid={Boolean(error)} id={id}><legend>{labelText}</legend><div className="choice-grid">{options.map((option, index) => <label key={option} htmlFor={`${id}-${index}`}><input id={`${id}-${index}`} type="checkbox" checked={value.split('|').includes(option)} onChange={event => onChange(event.target.checked ? [...value.split('|').filter(Boolean), option].join('|') : value.split('|').filter(item => item !== option).join('|'))} />{option}</label>)}</div></fieldset> : kind === 'file' ? <input {...common} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
      const file = event.target.files?.[0];
      onChange(file ? `${file.name}|${file.size}|${file.type}` : '');
    }} /> : <input {...common} type={['email', 'date', 'time', 'datetime-local', 'color'].includes(kind) ? kind : kind === 'phone' ? 'tel' : 'text'} inputMode={kind === 'money' ? 'decimal' : kind === 'integer' || (kind === 'code' && id === 'mfa') ? 'numeric' : undefined} value={value} onChange={event => onChange(event.target.value)} autoComplete={kind === 'code' ? 'off' : undefined} />}
    <small id={`${id}-help`}>{helper}{field.max && ['text', 'textarea'].includes(kind) ? ` · ${codePointLength(value.trim())}/${field.max} characters` : ''}</small>
    {error && <p className="error-text" id={`${id}-error`}>{error}</p>}
  </div>;
}
