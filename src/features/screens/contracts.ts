export type Role = 'visitor' | 'customer' | 'cashier' | 'manager' | 'owner' | 'admin';
export type Capability = 'campaigns' | 'contacts' | 'reversals' | 'exports' | 'billing' | 'support';
export type Access = { role: Role; grants: Capability[] };
export type Condition = { field: string; values: string[] };
export type Field = {
  id: string; label: string; kind?: 'text' | 'textarea' | 'email' | 'phone' | 'url' | 'money' | 'integer' | 'select' | 'multi' | 'checkbox' | 'date' | 'time' | 'datetime-local' | 'color' | 'file' | 'code';
  required?: boolean; min?: number; max?: number; options?: string[]; initial?: string; help?: string;
  when?: Condition; roles?: Role[]; disabled?: string;
};
export type Action = { label: string; to?: string; roles?: Role[]; capability?: Capability; confirm?: string; validate?: boolean; when?: Condition };
export type Section = { title: string; fields?: Field[]; readouts?: string[]; notes?: string[]; columns?: string[]; empty?: string; actions?: Action[]; roles?: Role[]; capability?: Capability; when?: Condition };
export type Screen = { id: string; title: string; description: string; role: Role; routes: string[]; sections: Section[]; tabs?: string[]; report?: boolean; capability?: Capability; tables: string[]; operations: string[] };
export const f = (id: string, label: string, options: Partial<Field> = {}): Field => ({ id, label, ...options });
export const required = (id: string, label: string, min = 1, max = 80): Field => f(id, label, { required: true, min, max });
export const select = (id: string, label: string, options: string[], initial?: string): Field => f(id, label, { kind: 'select', required: true, options, initial });
export const integer = (id: string, label: string, min: number, max: number, initial?: string): Field => f(id, label, { kind: 'integer', required: true, min, max, initial });
export const moneyField = (id: string, label: string, initial?: string): Field => f(id, label, { kind: 'money', required: true, min: 0, max: 1000000, initial });
export const check = (id: string, label: string, help?: string): Field => f(id, label, { kind: 'checkbox', help });
export const branches = (): Field => f('branches', 'Eligible branches', { kind: 'multi', required: true, options: ['Sample branch'], help: 'Only assigned active branches. Authority over every selected branch is required.' });
export const branch = (): Field => select('branch', 'Branch', ['Sample branch'], 'Sample branch');
export const reason = (): Field => f('reason', 'Reason', { kind: 'textarea', required: true, min: 10, max: 500 });
export const action = (label: string, extra: Partial<Action> = {}): Action => ({ label, ...extra });
export const save = (label = 'Save draft'): Action => action(label, { validate: true });
export const when = (field: string, ...values: string[]): Condition => ({ field, values });
export const hours: Field[] = [select('weekday', 'Day', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], 'Monday'), check('closed', 'Closed'), f('opens', 'Opening time', { kind: 'time', required: true, when: when('closed', 'false') }), f('closes', 'Closing time', { kind: 'time', required: true, when: when('closed', 'false') })];
export const policy = {
  preview: 'Local design fixture · Sample data only. Actions do not save, send, charge, award, or redeem.',
  unavailable: 'This action needs its authenticated server operation before it can be used. Nothing has been saved.',
  valid: 'Preview validated. Nothing has been saved or sent.',
  timezone: 'Dates and schedules use Asia/Karachi. Times use a 24-hour clock.',
  manual: 'Messages are sent manually. Open each chat, review the text, and press Send in the cafe’s WhatsApp account.',
  caps: 'Quiet hours: 9 pm–9 am. Marketing limits: two events per cafe and five across the platform per calendar week. Expired messages are suppressed.',
  readonly: 'Not connected',
};
export function allowed(access: Access, roles?: Role[], capability?: Capability) {
  if (roles && !roles.includes(access.role)) return false;
  if (!capability) return true;
  if (access.role === 'owner') return !['billing', 'support'].includes(capability);
  return (access.role === 'manager' || access.role === 'admin') && access.grants.includes(capability);
}
export function visible(condition: Condition | undefined, values: Record<string, string>) {
  return !condition || condition.values.includes(values[condition.field] ?? '');
}
