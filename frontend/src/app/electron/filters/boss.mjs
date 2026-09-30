import profile from '../../../account/adapters/filters/boss.mjs';
import {runPlatform} from '../../../common/desktop/main/visualFilterRunner.mjs';

runPlatform(profile).catch(error => {
  console.error(JSON.stringify({ok: false, code: /^[A-Z_]+$/.test(error.message) ? error.message : 'FILTER_FAILED'}));
  process.exitCode = 1;
});
