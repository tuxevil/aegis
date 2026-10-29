import fs from 'node:fs/promises';
const status=await fs.readFile('/proc/self/status','utf8');
if(process.getuid()!==1000||!/^CapEff:\s+0+$/m.test(status)||!/^CapBnd:\s+0+$/m.test(status))throw Error('privilege_drop_failed');
await fs.copyFile('/tmp/aegis-manual-network-setup.json','/data/manual-network-setup.json');
if(process.argv[2]==='--preflight')console.log(JSON.stringify({status:'kernel_policy_installed_preflight_only',uid:1000,capabilities:'none',providerRequests:0,dispatchMode:'DRY_RUN'}));
else if(process.argv[2]==='--execute-manual') {
  process.argv=[process.execPath,'/app/scripts/inamhi-manual.mjs','--execute-manual','--authorization-file=/authorization/query.json','--root=/data/inamhi-once'];
  await import('../../../scripts/inamhi-manual.mjs');
}else throw Error('explicit_mode_required');
