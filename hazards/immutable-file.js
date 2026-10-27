import fs from "node:fs/promises";
import {randomUUID} from "node:crypto";

// Single-writer private repository primitive. The destination is never replaced.
export async function createImmutableFile(file,bytes) {
  const temporary=file+"."+randomUUID()+".tmp";
  try {
    const handle=await fs.open(temporary,"wx",0o600);
    try {await handle.writeFile(bytes);await handle.sync();}
    finally {await handle.close();}
    await fs.link(temporary,file);
  } finally {await fs.unlink(temporary).catch(error=>{if(error.code!=="ENOENT") throw error;});}
}
