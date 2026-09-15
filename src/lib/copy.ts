export const copy = {
  setup: { title: 'A few things need setting up', body: 'This development environment is not connected to authentication yet. Your account and loyalty cards will be available after setup.' },
  cards: { empty: 'Your loyalty cards will appear here. Scan a cafe’s QR code to join.' },
  card: { nextReward: 'Your next reward', rewardAvailable: 'Reward available', offlineUpdated: 'Offline · Last updated',
    negativeBalance: (unit: 'stamps' | 'points') => `New ${unit} will offset this balance before your next reward.` },
  manualWhatsApp: 'Open each chat, review the text, and press Send in the cafe’s WhatsApp account.',
  customerSetup: {
    offers: { title: 'Offers', body: 'Your cafe offer inbox is being connected. Offers and claims are not available yet.' },
    referrals: { title: 'Referrals', body: 'Referral programmes are being connected. Share links and referral rewards are not available yet.' },
    account: { title: 'Account', body: 'Profile editing, cafe preferences and data requests are being connected. Device notification settings are available below.' },
    notifications: 'Notifications on this device',
  },
  nav: [{ label: 'Cards', href: '/app' }, { label: 'Offers', href: '/app/offers' }, { label: 'Referrals', href: '/app/referrals' }, { label: 'Account', href: '/app/settings' }],
} as const;
