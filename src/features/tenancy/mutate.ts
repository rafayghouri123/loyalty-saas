export async function mutate(path: string, input: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'Could not save. Please retry.');
  return result.data;
}
