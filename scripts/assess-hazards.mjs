import {RawArtifactStore} from "../hazards/artifact-store.js";
import {assessArchive} from "../hazards/assess.js";
const value=key=>process.argv.slice(2).find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
const directory=value("data-dir"),area=value("area"),asOf=value("as-of");
if(!directory||!area||!asOf)console.log("Safe mode: no network or writes. Use --data-dir=RESEARCH_DIR --area=PILOT --as-of=UTC [--fixture]. Private shadow output only.");
else {
  try {
    const store=new RawArtifactStore(directory,{origin:process.argv.includes("--fixture")?"synthetic_fixture":"captured_source",readOnly:true});
    console.log(JSON.stringify(await assessArchive({store,asOf,area}),null,2));
  }catch {console.error("Assessment refused: verify local archive, pilot and UTC cutoff. No publication.");process.exitCode=1;}
}
