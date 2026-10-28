import {readdirSync} from "node:fs";
import {spawnSync} from "node:child_process";
const directories=[".","public","public/watch","public/history","public/explorer","alerts","hazards","replay","scripts","api","storage","reports","schedules","push","feeds","test","test-support"];
for(const directory of directories) {
  for(const file of readdirSync(directory,{withFileTypes:true})) {
    if(!file.isFile() || !/\.(?:m?js)$/.test(file.name)) continue;
    const result=spawnSync(process.execPath,["--check",`${directory}/${file.name}`],{stdio:"inherit"});
    if(result.status!==0) process.exit(result.status||1);
  }
}
