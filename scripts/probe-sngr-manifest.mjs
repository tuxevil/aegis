// Three bounded GETs only: metadata, canton count and IDs. No geometry/archive.
import {writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {SngrLayerAcquirer} from "../hazards/arcgis-acquirer.js";
import {safeMode,SourceRegistry} from "../hazards/registry.js";
import {SourceHttp} from "../hazards/http.js";
import {createHash} from "node:crypto";
export async function main(args=process.argv.slice(2)) {
  if(!args.includes("--live")) {console.log(JSON.stringify({...safeMode,note:"No network. Opt-in --live --source=sngr.{flood,multihazard}.layer --area={guayaquil,pallatanga} [--out=NEW_FILE]. Metadata, count and IDs only."}));return;}
  if(args.some(a=>!["--live","--count-only"].includes(a)&&!a.startsWith("--source=")&&!a.startsWith("--area=")&&!a.startsWith("--out=")))throw new Error("invalid_arguments");
  const value=key=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
  let report;
  try {
    if(args.includes("--count-only")) {
      const sourceId=value("source"),area=value("area"),registry=new SourceRegistry();
      const capture=await new SourceHttp({registry}).get(sourceId,{mode:"count",area});
      const p=JSON.parse(capture.bytes.toString("utf8"));
      if(!Number.isSafeInteger(p.count)||p.count<0||Object.hasOwn(p,"error"))throw new Error("invalid_layer_count");
      report={...safeMode,inspectionOnly:true,inspectionKind:"count_only",sourceId,areaId:area,expectedCount:p.count,
        sourceUrl:capture.sourceUrl,retrievedAt:capture.retrievedAt,httpStatus:capture.httpStatus,elapsedMs:capture.elapsedMs,
        byteLength:capture.bytes.length,sha256:createHash("sha256").update(capture.bytes).digest("hex"),
        geometryDownloaded:false,licensing:registry.get(sourceId).licensing,publicationBlocked:true};
    } else report=await new SngrLayerAcquirer().acquire({sourceId:value("source"),area:value("area"),inspectOnly:true});
  }
  catch(error) {report={...safeMode,status:"BLOCKED_EXTERNAL",errorCode:/^(http_\d{3}|[a-z_]{1,80})$/.test(error.message)?error.message:"probe_failed",
    providerCode:Number.isSafeInteger(error.providerCode)?error.providerCode:null,requestEvidence:error.requestEvidence||[]};process.exitCode=1;}
  report={...report,producedAt:new Date().toISOString()};
  const payload=JSON.stringify(report,null,2)+"\n";
  if(value("out"))await writeFile(value("out"),payload,{flag:"wx",mode:0o600});
  process.stdout.write(payload);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error("Probe refused or output file already exists. No publication.");process.exitCode=1;});
