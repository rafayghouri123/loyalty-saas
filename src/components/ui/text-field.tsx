import type { ComponentProps, ReactNode } from 'react';

type Props = ComponentProps<'input'> & { id: string; label: string; help?: ReactNode; error?: string };
export function TextField({ id, label, help, error, ...input }: Props) {
  const describedBy = [input['aria-describedby'], help ? `${id}-help` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(' ');
  return <div className="field">
    <label htmlFor={id}>{label}{input.required && <span className="microcopy"> (required)</span>}</label>
    <input {...input} id={id} aria-invalid={error ? true : input['aria-invalid']} aria-describedby={describedBy || undefined} />
    {help && <small id={`${id}-help`}>{help}</small>}
    {error && <p id={`${id}-error`} className="error-text" role="alert">{error}</p>}
  </div>;
}
