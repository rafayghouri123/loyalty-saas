import {describe,it,expect} from 'vitest';
import {contentSecurityPolicy} from '../../src/lib/security/csp';
describe('production content policy',()=>{
  it('allows only the configured storage origin and necessary FCM endpoints',()=>{
    const policy=contentSecurityPolicy('test-nonce','https://tenant.supabase.co/path');
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'");
    expect(policy).toContain('https://tenant.supabase.co');expect(policy).not.toContain('/path');
    expect(policy).not.toMatch(/unsafe-eval|\*|https:\s/u);
    expect(policy).toContain("object-src 'none'");expect(policy).toContain("base-uri 'none'");
    expect(contentSecurityPolicy('test','javascript:alert(1)')).not.toContain('javascript:');
  });
});
