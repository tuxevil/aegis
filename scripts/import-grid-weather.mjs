import fs from "node:fs/promises";
import path from "node:path";
import {RawArtifactStore} from "../hazards/artifact-store.js";
import {GridWeatherBridge} from "../hazards/grid-weather.js";
const value=key=>process.argv.slice(2).find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
const file=value("status-json"),directory=value("data-dir");
if(!file||!directory) {console.log("Safe mode: no reads/writes/network. Use --status-json=LOCAL_JSON --data-dir=RESEARCH_DIR [--fixture].");}
else {
  try {
    const handle=await fs.open(path.resolve(file),"r");let text;
    try {if((await handle.stat()).size>2_000_000)throw new Error("input_too_large");text=await handle.readFile("utf8");}finally {await handle.close();}
    const fixture=process.argv.includes("--fixture"),store=new RawArtifactStore(path.resolve(directory),{origin:fixture?"synthetic_fixture":"captured_source"});
    console.log(JSON.stringify(await new GridWeatherBridge({store}).capture(JSON.parse(text),{fixture}),null,2));
  }catch {console.error("Local weather import refused. No private source fields are logged.");process.exitCode=1;}
}
