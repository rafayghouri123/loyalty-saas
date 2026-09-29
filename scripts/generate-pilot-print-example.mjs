import {mkdirSync,writeFileSync} from 'node:fs';
import {signupArtwork,signupDestination} from '../src/features/tenancy/signup-assets.ts';
const destination=signupDestination('https://example.invalid','test-only-cafe','b9000000-0000-4000-8000-000000000001');
mkdirSync('docs/pilot-assets',{recursive:true});
for(const format of ['svg','png'])writeFileSync(`docs/pilot-assets/test-only-signup.${format}`,await signupArtwork({destination,cafe:'TEST ONLY - Sample cafe',branch:'Print demonstration, not a live cafe',proposition:'DEMO ONLY - use Settings for real signup assets'},format));
console.log('Created labeled print examples. Real cafes download their persisted public branch assets from Settings.');
