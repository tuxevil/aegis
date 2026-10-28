// Offline private projection. No HTTP, server, publication or source archive writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RawArtifactStore} from '../hazards/artifact-store.js';
import {TerritoryPreviewReader} from '../hazards/territory-preview.js';
import {safeMode} from '../hazards/registry.js';
export async function main(args=process.argv.slice(2)) {
  if(!args.length){console.log(JSON.stringify({...safeMode,note:'No network or writes. Use --data-dir=PRIVATE_ARCHIVE --source=LAYER --area=PILOT --out=NEW_PRIVATE_FILE [--fixture] [--limit=20] [--offset=0]. Output is private review only.'}));return;}
  const keys=['data-dir','source','area','out','limit','offset'],options={};let fixture=false;
  for(const arg of args) {
    if(arg==='--fixture'&&!fixture){fixture=true;continue;}
    const match=arg.match(/^--([a-z-]+)=(.+)$/);
    if(!match||!keys.includes(match[1])||Object.hasOwn(options,match[1]))throw new Error('invalid_territory_arguments');options[match[1]]=match[2];
  }
  if(['data-dir','source','area','out'].some(k=>!options[k]))throw new Error('invalid_territory_arguments');
  for(const key of ['limit','offset'])if(options[key]!==undefined&&!/^(0|[1-9]\d{0,5})$/.test(options[key]))throw new Error('invalid_territory_arguments');
  const root=await fs.realpath(options['data-dir']),output=path.resolve(options.out),parent=await fs.realpath(path.dirname(output));
  const relative=path.relative(root,parent);
  if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw new Error('territory_output_must_be_separate');
  const reader=new TerritoryPreviewReader({store:new RawArtifactStore(root,{namespace:'layers',origin:fixture?'synthetic_fixture':'captured_source',readOnly:true})});
  const result=await reader.read({sourceId:options.source,area:options.area,limit:options.limit===undefined?20:Number(options.limit),offset:options.offset===undefined?0:Number(options.offset)});
  const handle=await fs.open(path.join(parent,path.basename(output)),'wx',0o600);
  try {await handle.writeFile(JSON.stringify(result)+'\n');await handle.sync();}finally {await handle.close();}
  console.log(JSON.stringify({...safeMode,privateReviewOnly:true,recordOrigin:result.recordOrigin,status:result.status,featureCount:result.features.length,pagination:result.pagination}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error('Private territory inspection refused. Check archive, budgets and a new output outside DATA_DIR. No publication.');process.exitCode=1;});
