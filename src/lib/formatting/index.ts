export function formatPaisa(paisa: string | bigint) {
  const amount = BigInt(paisa);
  const absolute = amount < 0 ? -amount : amount;
  const whole = new Intl.NumberFormat('en-PK').format(absolute / 100n);
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${amount < 0 ? '-' : ''}Rs ${whole}${fraction === '00' ? '' : `.${fraction}`}`;
}
export const formatUnits = (value: string | bigint) => new Intl.NumberFormat('en-PK').format(BigInt(value));
