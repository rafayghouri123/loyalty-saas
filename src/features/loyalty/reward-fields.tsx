export type RewardFieldValues = {
  title: string;
  cost: string;
  description: string;
  terms: string;
  estimate: string;
};

type RewardFieldsProps = {
  values: RewardFieldValues;
  branches: { id: string; name: string }[];
  branchIds: string[];
  onFieldChange: (field: keyof RewardFieldValues, value: string) => void;
  onBranchIdsChange: (ids: string[]) => void;
};

export function RewardFields({ values, branches, branchIds, onFieldChange, onBranchIdsChange }: RewardFieldsProps) {
  return <>
    <label className="field">Reward title<input name="rewardTitle" required minLength={2} maxLength={80} value={values.title} onChange={e => onFieldChange('title', e.target.value)}/></label>
    <label className="field">Required units<input name="rewardCost" type="number" min={1} max={1000000} required value={values.cost} onChange={e => onFieldChange('cost', e.target.value)}/></label>
    <label className="field">Description (optional)<textarea name="rewardDescription" maxLength={500} value={values.description} onChange={e => onFieldChange('description', e.target.value)}/></label>
    <label className="field">Reward terms<textarea name="rewardTerms" required minLength={10} maxLength={2000} value={values.terms} onChange={e => onFieldChange('terms', e.target.value)}/></label>
    <fieldset><legend>Eligible branches</legend>{branches.map(branch => <label className="check-label" key={branch.id}><input type="checkbox" name="branches" value={branch.id} checked={branchIds.includes(branch.id)} onChange={e => onBranchIdsChange(e.target.checked ? [...branchIds, branch.id] : branchIds.filter(id => id !== branch.id))}/>{branch.name}</label>)}</fieldset>
    <label className="field">Estimated fulfillment cost (Rs, optional)<input name="estimatedCost" inputMode="decimal" value={values.estimate} onChange={e => onFieldChange('estimate', e.target.value)}/></label>
  </>;
}
