// Return only fixed labels. Never log error messages, SQL, paths or provider payloads.
export function registrationFailureCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unexpected_failure';
  const code = 'code' in error ? error.code : undefined;
  if (['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(String(code))) return 'database_tls';
  if (code === 'ENOENT') return 'certificate_file_missing';
  if (code === '28P01' || code === '28000') return 'database_credentials';
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(String(code))) return 'database_connection';
  if (code === '42501') return 'database_permission_or_session';
  if (code === '42883' || code === '42P01') return 'database_migrations';
  if (error instanceof Error) {
    if (error.message === 'A canonical base64-encoded 32-byte key is required.') return 'encryption_key_invalid';
    if (error.message === 'Invalid gateway database configuration.') return 'gateway_configuration';
    if (error.message === 'Dedicated web gateway role required.') return 'gateway_role';
    if (error.name === 'ZodError') return 'challenge_response_invalid';
  }
  return 'unexpected_failure';
}
