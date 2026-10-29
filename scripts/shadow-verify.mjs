import {verifyShadowLab} from '../hazards/shadow-recovery.js';
const args=process.argv.slice(2);
if(!args.length)console.log('Read-only, stopped laboratory verification: --root=PRIVATE_DIR');
else {
  try{if(args.length!==1||!args[0].startsWith('--root=')||!args[0].slice(7))throw Error();console.log(JSON.stringify(await verifyShadowLab(args[0].slice(7))));}
  catch{console.error('Shadow verification failed: stop writers and inspect private format/integrity; no automatic repair.');process.exitCode=1;}
}
