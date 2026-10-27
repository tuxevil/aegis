// Manual research CLI. No polling, publication, arbitrary URLs or WAHA access.
import path from "node:path";
import {pathToFileURL} from "node:url";
import {SourceRegistry,safeMode} from "../hazards/registry.js";
import {RawArtifactStore} from "../hazards/artifact-store.js";
import {LayerResearchService} from "../hazards/layer-research.js";

export async function main(args=process.argv.slice(2)) {
  if(!args.length) {
    console.log(JSON.stringify({...safeMode,note:"No network or writes. Research only: --live --research-archive --source=ID --area=PILOT --data-dir=PATH. Use --verify instead of --live to verify the latest local collection.",sources:new SourceRegistry().layerSources().map(s=>s.id)},null,2));
    return;
  }
  if(args.some(a=>!["--live","--research-archive","--verify","--verify-all"].includes(a)&&!a.startsWith("--source=")&&!a.startsWith("--area=")&&!a.startsWith("--data-dir="))) throw new Error("invalid_arguments");
  const value=key=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
  const directory=value("data-dir");if(!directory)throw new Error("explicit_data_directory_required");
  const service=new LayerResearchService({store:new RawArtifactStore(path.resolve(directory),{namespace:"layers"}),networkEnabled:args.includes("--live"),allowPendingLicense:args.includes("--research-archive")});
  const result=args.includes("--verify-all")?await service.verifyArchive():args.includes("--verify")?await service.verify(value("source"),value("area")):await service.collect(value("source"),value("area"));
  console.log(JSON.stringify(result,null,2));if(result.errorCode)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error("Acquisition refused or failed. Check documented arguments, research opt-in and private storage. No publication.");process.exitCode=1;});
