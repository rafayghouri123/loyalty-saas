import type { ReactNode } from 'react';
import { Coffee, Gift } from 'lucide-react';
import { cardColors, cardProgress } from '../lib/branding';
import { copy } from '../lib/copy';

type Props = {
  businessName: string;
  accent: string;
  logo?: ReactNode;
  programme: 'stamps' | 'points';
  balance: number;
  rewardTitle: string;
  rewardCost: number;
  serverEligible: boolean;
  offlineUpdatedAt?: string;
  action?: ReactNode;
};

// Presentation only. Eligibility comes from the authoritative server projection.
export function LoyaltyCard(props: Props) {
  const colors = cardColors(props.accent);
  const progress = cardProgress(props.balance, props.rewardCost);
  const number = new Intl.NumberFormat('en-PK');
  const progressText = `${number.format(progress.balance)} of ${number.format(progress.cost)} ${props.programme}`;
  const available = props.serverEligible && props.balance >= props.rewardCost && !props.offlineUpdatedAt;
  return <article className="member-card" aria-label={`${props.businessName} loyalty card`}>
    <div className="member-card-brand" style={{ background: colors.background, color: colors.color }}>
      <span className="member-card-logo">{props.logo ?? <Coffee aria-hidden="true" />}</span>
      <strong>{props.businessName}</strong>
    </div>
    <div className="member-card-content">
      <p className="eyebrow">{copy.card.nextReward}</p>
      <h2>{props.rewardTitle}</h2>
      {available && <p className="badge"><Gift size={16} aria-hidden="true" /> {copy.card.rewardAvailable}</p>}
      {props.programme === 'stamps' && props.rewardCost <= 20 ?
        <div className="stamp-grid" aria-hidden="true">{Array.from({ length: props.rewardCost }, (_, index) =>
          <span className={`stamp ${index < progress.visibleUnits ? 'filled' : ''}`} key={index}>
            {index < progress.visibleUnits ? <Coffee size={20} /> : index === props.rewardCost - 1 ? <Gift size={20} /> : index + 1}
          </span>)}</div> :
        <progress className="member-card-meter" value={progress.visibleUnits} max={progress.cost} aria-label={progressText} />}
      <p className="member-card-balance">{progressText}</p>
      {props.balance < 0 && <p className="microcopy">{copy.card.negativeBalance(props.programme)}</p>}
      {props.offlineUpdatedAt && <p className="microcopy">{copy.card.offlineUpdated} <time dateTime={props.offlineUpdatedAt}>{new Intl.DateTimeFormat('en-PK', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi',
      }).format(new Date(props.offlineUpdatedAt))} PKT</time></p>}
      {props.action}
    </div>
  </article>;
}
