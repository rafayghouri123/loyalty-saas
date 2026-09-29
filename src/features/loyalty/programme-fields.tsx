export type ProgrammeFieldValues = {
  name: string;
  minimum: string;
  stamps: string;
  spendStep: string;
  units: string;
  cap: string;
  terms: string;
};

type ProgrammeFieldsProps = {
  mode: 'stamps' | 'points';
  values: ProgrammeFieldValues;
  onModeChange: (mode: 'stamps' | 'points') => void;
  onFieldChange: (field: keyof ProgrammeFieldValues, value: string) => void;
};

export function ProgrammeFields({ mode, values, onModeChange, onFieldChange }: ProgrammeFieldsProps) {
  return <>
    <label className="field">Programme name<input name="name" required minLength={2} maxLength={80} value={values.name} onChange={e => onFieldChange('name', e.target.value)}/></label>
    <label className="field">Programme type<select value={mode} onChange={e => onModeChange(e.target.value as 'stamps' | 'points')}><option value="stamps">Stamps</option><option value="points">Points</option></select></label>
    <label className="field">Minimum eligible spend (Rs)<input name="minimum" required inputMode="decimal" value={values.minimum} onChange={e => onFieldChange('minimum', e.target.value)}/></label>
    {mode === 'stamps' ? <label className="field">Stamps per qualifying purchase<input name="stamps" type="number" min={1} max={10} required value={values.stamps} onChange={e => onFieldChange('stamps', e.target.value)}/></label> : <>
      <label className="field">Spend step (Rs)<input name="spendStep" required inputMode="decimal" value={values.spendStep} onChange={e => onFieldChange('spendStep', e.target.value)}/></label>
      <label className="field">Points per step<input name="units" type="number" min={1} max={1000} required value={values.units} onChange={e => onFieldChange('units', e.target.value)}/></label>
    </>}
    <label className="field">Maximum base units per purchase<input name="cap" type="number" min={1} max={100000} required value={values.cap} onChange={e => onFieldChange('cap', e.target.value)}/></label>
    <label className="field">Programme terms<textarea name="terms" required minLength={10} maxLength={3000} value={values.terms} onChange={e => onFieldChange('terms', e.target.value)}/></label>
    <p>Eligible spend is paid eligible goods after discounts, excluding tax and tips. Staff enter and attest purchases; no POS verification is implied.</p>
  </>;
}
