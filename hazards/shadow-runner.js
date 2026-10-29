import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {SourceRegistry,safeMode} from './registry.js';

const DAY=86400000, digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const codes=new Set(['timeout','network_or_read_error','http_403','http_429','invalid_source_envelope','body_too_large','ingestion_failed']);

// Private, bounded, single-writer checkpoints. Hash detects damage, not forgery.
export async function writeCheckpoint(file,value) {
  const temporary=file+'.'+randomUUID()+'.tmp';
  const bytes=JSON.stringify({value,sha256:digest(value)});
  if(Buffer.byteLength(bytes)>2_000_000)throw Error('checkpoint_capacity');
  try {
    const handle=await fs.open(temporary,'wx',0o600);
    try {await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    await fs.rename(temporary,file);
    const parent=await fs.open(path.dirname(file),'r');
    try {await parent.sync();}finally{await parent.close();}
  }finally{await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export async function readCheckpoint(file) {
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2_000_000)throw Error('invalid_checkpoint');
  const {value,sha256}=JSON.parse(await fs.readFile(file,'utf8'));
  if(digest(value)!==sha256)throw Error('checkpoint_corrupt');
  return value;
}

export function validateShadowPlan(plan,registry=new SourceRegistry()) {
  if(plan?.version!==1||plan.mode!=='synthetic_fixture'||plan.alertsPublishEnabled!==false||plan.dispatchMode!=='DRY_RUN'||
    !integer(plan.maxDiskBytes,4194304,1073741824)||!integer(plan.maxEvents,10,1000)||
    !integer(plan.hostIntervalMs,1000,DAY)||!Array.isArray(plan.providers)||!plan.providers.length||plan.providers.length>8)
    throw Error('invalid_shadow_plan');
  const keys=new Set();
  for(const p of plan.providers) {
    const source=registry.get(p.sourceId);
    if(!/^[a-z0-9._-]{2,100}$/.test(p.key)||keys.has(p.key)||
      !integer(p.intervalMs,1000,DAY)||!integer(p.dailyBudget,1,1000)||!integer(p.timeoutMs,10,120000)||
      !integer(p.maxResponseBytes,1,source.maxBytes)||!integer(p.ttlMs,1000,7*DAY))throw Error('invalid_shadow_provider');
    keys.add(p.key);
  }
  return structuredClone(plan);
}

export async function directoryBytes(root,limit=10000) {
  let bytes=0,count=0;
  async function visit(dir) {
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
      if(++count>limit)throw Error('storage_entry_limit');
      const file=path.join(dir,entry.name);
      if(entry.isSymbolicLink())throw Error('storage_symlink');
      if(entry.isDirectory())await visit(file);
      else if(entry.isFile())bytes+=(await fs.stat(file)).size;
      else throw Error('storage_special_file');
    }
  }
  await visit(root);return bytes;
}

// No transport, routes, timers or publisher are imported here. One tick is one
// serialized batch. CLI currently supplies synthetic providers ONLY.
export class ShadowRunner {
  constructor({root,plan,poll,now=()=>Date.now(),registry=new SourceRegistry(),measure=async()=>({})}) {
    if(typeof poll!=='function'||!root)throw Error('shadow_dependencies_required');
    Object.assign(this,{root:path.resolve(root),plan:validateShadowPlan(plan,registry),poll,now,registry,measure});
    this.fingerprint=digest(this.plan);this.busy=false;this.closed=false;this.stopping=false;
  }
  async open() {
    await fs.mkdir(this.root,{recursive:true,mode:0o700});
    const st=await fs.lstat(this.root);
    if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('private_shadow_directory_required');
    this.lock=await fs.open(path.join(this.root,'runner.lock'),'wx',0o600);
    try {
      try {this.state=await readCheckpoint(path.join(this.root,'state.json'));}
      catch(e) {
        if(e.code!=='ENOENT')throw e;
        if((await fs.readdir(this.root)).some(n=>n!=='runner.lock'))throw Error('unmarked_shadow_directory');
        this.state={version:1,mode:'synthetic_fixture',fingerprint:this.fingerprint,lastClock:0,heartbeatAt:null,
          stoppedReason:null,hosts:{},events:[],totals:{attempts:0,bytes:0,unknownByteAttempts:0,successes:0,failures:0},providers:{}};
      }
      if(this.state.version!==1||this.state.mode!=='synthetic_fixture'||this.state.fingerprint!==this.fingerprint||
        !integer(this.state.lastClock,0,Number.MAX_SAFE_INTEGER)||!Array.isArray(this.state.events))throw Error('shadow_state_incompatible');
      for(const p of this.plan.providers) {
        this.state.providers[p.key]??={attempts:[],nextAt:0,failures:0,lastSuccessAt:null,lastHash:null,lastError:null,bytes:0,successes:0};
        const s=this.state.providers[p.key];
        if(!Array.isArray(s.attempts)||s.attempts.length>p.dailyBudget||s.attempts.some(x=>!integer(x,0,Number.MAX_SAFE_INTEGER))||
          !integer(s.nextAt,0,Number.MAX_SAFE_INTEGER)||!integer(s.failures,0,Number.MAX_SAFE_INTEGER))throw Error('shadow_state_incompatible');
      }
      await this.save();return this;
    }catch(e){await this.close();throw e;}
  }
  async save(){await writeCheckpoint(path.join(this.root,'state.json'),this.state);}
  async paused(){try {await fs.lstat(path.join(this.root,'PAUSE'));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
  health(at=this.now()) {
    return this.plan.providers.map(p=>{
      const s=this.state.providers[p.key],age=s.lastSuccessAt===null?null:at-s.lastSuccessAt;
      return {key:p.key,sourceId:p.sourceId,status:age===null?'unknown':age<0?'unknown':age>=p.ttlMs?'stale':s.lastError?'degraded':'synthetic_success',
        lastSuccessAt:s.lastSuccessAt,lastError:s.lastError,nextAttemptAt:s.nextAt,requestsInRollingDay:s.attempts.filter(x=>x>at-DAY).length,
        bytes:s.bytes,successes:s.successes,lastArtifactSha256:s.lastHash,notRiskStatus:true};
    });
  }
  snapshot(){return {mode:'synthetic_fixture',...safeMode,publicationBlocked:true,heartbeatAt:this.state.heartbeatAt,
    stoppedReason:this.state.stoppedReason,totals:structuredClone(this.state.totals),sources:this.health(),events:structuredClone(this.state.events)};}
  async tick() {
    if(!this.lock||this.closed||this.busy||this.stopping)throw Error('runner_not_available');
    this.busy=true;
    try {
      const at=this.now();
      if(!integer(at,1,Number.MAX_SAFE_INTEGER)||at<this.state.lastClock)throw Error('clock_moved_backwards');
      this.state.lastClock=at;
      if(this.state.stoppedReason||await this.paused()) {
        this.state.heartbeatAt=at;await this.save();
        return {...this.snapshot(),paused:true,resources:{...await this.measure(),powerWatts:null,energyWh:null}};
      }
      const disk=await directoryBytes(this.root);
      if(disk>=this.plan.maxDiskBytes-2_000_000){this.state.stoppedReason='storage_budget';await this.save();return this.snapshot();}
      for(const p of this.plan.providers) {
        if(this.stopping||await this.paused())break;
        if(await directoryBytes(this.root)>=this.plan.maxDiskBytes-2_000_000-2*p.maxResponseBytes) {
          this.state.stoppedReason='storage_budget';await this.save();break;
        }
        const s=this.state.providers[p.key],host=new URL(this.registry.get(p.sourceId).url).hostname;
        s.attempts=s.attempts.filter(x=>x>at-DAY);
        if(s.attempts.length>=p.dailyBudget||at<s.nextAt||at<(this.state.hosts[host]||0))continue;
        // Reserve attempt AND next slot durably before side effects; a crash uses
        // quota rather than repeating an unrecorded request on restart.
        s.attempts.push(at);s.nextAt=at+p.intervalMs;this.state.hosts[host]=at+this.plan.hostIntervalMs;
        this.state.totals.attempts++;await this.save();
        const started=performance.now(),controller=new AbortController();this.controller=controller;
        const timer=setTimeout(()=>controller.abort(),p.timeoutMs);
        let result;
        try {
          // Do not race and abandon a provider that ignores AbortSignal: retain
          // the lock and stop future work until it settles (container stop is bounded).
          result=await this.poll(p,{signal:controller.signal});
          if(controller.signal.aborted)throw Error('timeout');
          if(result&&integer(result.responseBytes,p.maxResponseBytes+1,Number.MAX_SAFE_INTEGER))throw Error('body_too_large');
          if(!result||!integer(result.responseBytes,0,p.maxResponseBytes)||
            (result.httpStatus!==undefined&&!integer(result.httpStatus,100,599)))throw Error('invalid_source_envelope');
          if(result.httpStatus===403||result.httpStatus===429) {
            const retry=integer(result.retryAfterMs,0,7*DAY)?result.retryAfterMs:DAY;
            this.state.hosts[host]=Math.max(this.state.hosts[host],at+retry);
          }
          if(result.status!=='ok')throw Error(result.httpStatus===403?'http_403':result.httpStatus===429?'http_429':'ingestion_failed');
          if(!/^[a-f0-9]{64}$/.test(result.artifactSha256))throw Error('invalid_source_envelope');
          s.lastSuccessAt=at;s.lastHash=result.artifactSha256;s.lastError=null;s.failures=0;s.successes++;
          this.state.totals.successes++;
        }catch(e) {
          s.failures++;s.lastError=controller.signal.aborted?'timeout':codes.has(e.message)?e.message:'ingestion_failed';
          s.nextAt=Math.max(s.nextAt,at+Math.min(DAY,p.intervalMs*2**Math.min(8,s.failures-1)));
          this.state.totals.failures++;
        }finally {clearTimeout(timer);this.controller=null;}
        const bytes=integer(result?.responseBytes,0,Number.MAX_SAFE_INTEGER)?result.responseBytes:null;
        if(bytes===null)this.state.totals.unknownByteAttempts++;
        s.bytes+=bytes||0;this.state.totals.bytes+=bytes||0;
        this.state.events.push({at,key:p.key,elapsedMs:Math.round(performance.now()-started),bytes,errorCode:s.lastError,
          artifactSha256:s.lastError?null:s.lastHash,publicationBlocked:true});
        this.state.events=this.state.events.slice(-this.plan.maxEvents);
        this.state.heartbeatAt=this.now();await this.save();
      }
      if(this.state.heartbeatAt!==at){this.state.heartbeatAt=at;await this.save();}
      const measured=await this.measure();
      return {...this.snapshot(),resources:{...measured,storageBytes:await directoryBytes(this.root),powerWatts:null,energyWh:null}};
    }finally{this.busy=false;}
  }
  requestStop(){this.stopping=true;this.controller?.abort();}
  async close() {
    if(this.busy)throw Error('runner_busy');
    if(this.lock){await this.lock.close();this.lock=null;await fs.unlink(path.join(this.root,'runner.lock'));}
    this.closed=true;
  }
}
