import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// A successful Next build does not prove the SDK registered imported steps.
const bundle=readFileSync('src/app/.well-known/workflow/v1/step/route.js','utf8');
for(const name of ['workerWave','rotateWorker'])assert.match(bundle,new RegExp(`registerStepFunction\\w*\\("step//[^"\\n]+//${name}",`),`Workflow step ${name} is absent from its executable bundle.`);
console.log('PASS worker Workflow steps are registered in the executable deployment bundle.');
