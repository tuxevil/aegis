// Manual research-only ingestion. No production service, polling or publishing.
import path from "node:path";
import {pathToFileURL} from "node:url";
import {RawArtifactStore} from "../hazards/artifact-store.js";
import {SourceRegistry,safeMode} from "../hazards/registry.js";
import {IngestionService} from "../hazards/ingestion.js";

export async function main(args=process.argv.slice(2)) {
  const registry=new SourceRegistry();
  if(!args.length) {
    process.stdout.write(JSON.stringify({...safeMode,note:"No network or writes. Manual --live requires --source=ID --data-dir=PATH; pending licenses require --research-archive.",sources:registry.list().map(s=>s.id)},null,2)+"\n");
    return;
  }
  if(args.some(a=>!["--live","--research-archive","--health","--verify"].includes(a)&&!a.startsWith("--source=")&&!a.startsWith("--data-dir=")&&!a.startsWith("--run=")&&!a.startsWith("--area=")&&!a.startsWith("--reprocess="))) throw new Error("invalid_arguments");
  const run=args.find(a=>a.startsWith("--run="))?.slice(6),area=args.find(a=>a.startsWith("--area="))?.slice(7);
  if((run===undefined)!==(area===undefined)||((run!==undefined)&&args.some(a=>["--verify","--health"].includes(a)||a.startsWith("--reprocess="))))throw new Error("invalid_arguments");
  for(const key of ["--run=","--area=","--source=","--data-dir=","--reprocess="])if(args.filter(a=>a.startsWith(key)).length>1)throw new Error("invalid_arguments");
  const dataDir=args.find(a=>a.startsWith("--data-dir="))?.slice(11);
  if(!dataDir) throw new Error("explicit_data_directory_required");
  const store=new RawArtifactStore(path.resolve(dataDir));
  const service=new IngestionService({store,registry,networkEnabled:args.includes("--live"),allowPendingLicense:args.includes("--research-archive")});
  let result;
  if(args.includes("--verify")) result=await store.verify();
  else if(args.includes("--health")) result=await service.health();
  else if(args.some(a=>a.startsWith("--reprocess="))) result=await service.reprocess(args.find(a=>a.startsWith("--reprocess=")).slice(12));
  else {
    const sourceId=args.find(a=>a.startsWith("--source="))?.slice(9);
    if(!sourceId) throw new Error("source_required");
    result=await service.ingest(sourceId,run===undefined?undefined:{run,area});
  }
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(result?.errorCode) process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error("Ingestion refused or failed; check documented arguments and local storage. No publication.");process.exitCode=1;});
