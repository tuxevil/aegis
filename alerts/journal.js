import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {createImmutableFile} from "../hazards/immutable-file.js";
import {utcMillis} from "../hazards/time.js";

const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const filename=sequence=>String(sequence).padStart(8,"0")+".json";
// Private bounded immutable transactions. A crashed writer leaves a lock for an
// operator to inspect; no automatic lock stealing or historical overwriting.
export class AlertJournal {
  constructor(dataDir,{origin="captured_source",kind="editorial",maxEvents=10000,maxBytes=64*1024*1024}={}) {
    if(!["editorial","subscriptions"].includes(kind)||!dataDir||!["captured_source","synthetic_fixture"].includes(origin)||!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>99999999||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error("invalid_alert_store");
    Object.assign(this,{origin,kind,maxEvents,maxBytes});
    this.root=path.join(path.resolve(dataDir),kind==="editorial"?"alerts":"subscriptions","v1",origin);
  }
  async initialize() {await fs.mkdir(this.root,{recursive:true,mode:0o700});}
  async entries() {
    await this.initialize();
    const names=(await fs.readdir(this.root)).filter(n=>/^\d{8}\.json$/.test(n)).sort();
    if(names.length>this.maxEvents)throw new Error("alert_store_capacity");
    let previousHash=null,previousTime=-Infinity,total=0;
    const entries=[];
    for(let i=0;i<names.length;i++) {
      if(names[i]!==filename(i+1))throw new Error("alert_journal_gap");
      const file=path.join(this.root,names[i]),stat=await fs.stat(file);total+=stat.size;
      if(total>this.maxBytes)throw new Error("alert_store_capacity");
      const entry=JSON.parse(await fs.readFile(file,"utf8")),{sha256,...payload}=entry;
      const time=utcMillis(payload.at);
      if((payload.journalKind??"editorial")!==this.kind||payload.version!==1||payload.origin!==this.origin||payload.sequence!==i+1||payload.previousHash!==previousHash||sha256!==digest(payload)||!Number.isFinite(time)||time<previousTime)throw new Error("alert_journal_corrupt");
      previousHash=sha256;previousTime=time;entries.push(entry);
    }
    return entries;
  }
  async transact({at,actor,action},update) {
    if(!Number.isFinite(utcMillis(at))||!actor||typeof actor.id!=="string"||!/^[a-zA-Z0-9._-]{1,80}$/.test(actor.id)||!["editor","approver"].includes(actor.role)||!/^[a-z_]{1,40}$/.test(action))throw new Error("invalid_alert_transaction");
    await this.initialize();let lock;
    try {lock=await fs.open(path.join(this.root,"writer.lock"),"wx",0o600);}
    catch(error){if(error.code==="EEXIST")throw new Error("alert_store_busy");throw error;}
    try {
      const entries=await this.entries(),prior=entries.at(-1);
      if(entries.length>=this.maxEvents)throw new Error("alert_store_capacity");
      if(prior&&utcMillis(at)<utcMillis(prior.at))throw new Error("alert_clock_regression");
      const result=await update(structuredClone(entries));
      // Deduplication is a read; it does not append a misleading second action.
      if(result.unchanged)return structuredClone(result.value);
      const payload={version:1,journalKind:this.kind,origin:this.origin,sequence:entries.length+1,previousHash:prior?.sha256??null,at,actor:{id:actor.id,role:actor.role},action,data:result.data};
      const bytes=Buffer.from(JSON.stringify({...payload,sha256:digest(payload)}));
      let total=bytes.length;
      for(const entry of entries)total+=(await fs.stat(path.join(this.root,filename(entry.sequence)))).size;
      if(total>this.maxBytes)throw new Error("alert_store_capacity");
      await createImmutableFile(path.join(this.root,filename(payload.sequence)),bytes);
      return structuredClone(result.value);
    } finally {await lock.close();await fs.unlink(path.join(this.root,"writer.lock"));}
  }
}
