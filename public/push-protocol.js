/* Data-only FCM protocol shared by the service worker and its boundary tests. */
self.LoyaltyPushProtocol = {
  challenge(data) {
    return data && data.type === 'loyalty.registration.v1'
      && /^[0-9a-f-]{36}$/i.test(data.challengeId || '') && /^[0-9a-f-]{36}$/i.test(data.installationId || '')
      && /^[A-Za-z0-9_-]{43}$/.test(data.nonce || '');
  },
  matchesBinding(data, binding) {
    return !!binding && data?.type === 'loyalty.notification.v1'
      && typeof binding.bindingGeneration === 'string' && typeof binding.installationId === 'string'
      && data.bindingGeneration === binding.bindingGeneration && data.installationId === binding.installationId;
  },
};
