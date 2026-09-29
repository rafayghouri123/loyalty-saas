import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const bundle=readFileSync('app/.well-known/workflow/v1/step/route.js','utf8');
for(const name of ['monitorCheck','continueMonitor'])assert.match(bundle,new RegExp(`registerStepFunction\\w*\\("step//[^"\\n]+//${name}",`),'monitor_steps_not_registered');
console.log('PASS executable monitor steps registered.');
