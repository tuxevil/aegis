import fs from "node:fs/promises";
import path from "node:path";
import {constants,createReadStream,createWriteStream} from "node:fs";
import {pipeline} from "node:stream/promises";
import {Transform} from "node:stream";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {HistoryStore} from "./history.js";
import {RawArtifactStore} from "./hazards/artifact-store.js";
import {LayerResearchService} from "./hazards/layer-research.js";
import {AlertJournal} from "./alerts/journal.js";
import {editorialState} from "./alerts/editorial.js";
import {outboxState} from "./alerts/outbox.js";
import {ZoneSubscriptions} from "./alerts/subscriptions.js";
import {createImmutableFile} from "./hazards/immutable-file.js";
import {utcMillis} from "./hazards/time.js";
const manifestName="aegis-backup.v1.json";
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function limits(options={}) {
  const {maxEntries=50000,maxBytes=1024**3}=options;
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>100000||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>8*1024**3)throw new Error("backup_invalid_budget");
  return {maxEntries,maxBytes};
}
function safeRelative(value) {return typeof value==="string"&&value.length>0&&value.length<=1024&&!/[\\\u0000-\u001f\u007f]/.test(value)&&value.split("/").every(part=>part&&part!=="."&&part!=="..")&&!path.isAbsolute(value);}
const inside=(parent,child)=>{const rel=path.relative(parent,child);return rel===""||(!rel.startsWith(".."+path.sep)&&rel!==".."&&!path.isAbsolute(rel));};
async function realDirectory(directory) {
  if(typeof directory!=="string"||!directory)throw new Error("backup_invalid_directory");
  const root=path.resolve(directory),stat=await fs.lstat(root);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error("backup_directory_required");
  return fs.realpath(root);
}
async function newDestination(directory,source) {
  if(typeof directory!=="string"||!directory)throw new Error("backup_invalid_directory");
  const resolved=path.resolve(directory),parent=await realDirectory(path.dirname(resolved)),root=path.join(parent,path.basename(resolved));
  if(inside(source,root)||inside(root,source))throw new Error("backup_overlapping_directories");
  try {await fs.mkdir(root,{mode:0o700});}
  catch(error){if(error.code==="EEXIST")throw new Error("backup_destination_exists");throw error;}
  return root;
}
async function fileDigest(file,maxBytes) {
  const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const before=await handle.stat();if(before.size>maxBytes)throw new Error("backup_capacity_exceeded");if(!before.isFile())throw new Error("backup_regular_file_required");
    const hash=createHash("sha256");let bytes=0;
    for await(const chunk of handle.createReadStream({autoClose:false})) {bytes+=chunk.length;if(bytes>maxBytes)throw new Error("backup_capacity_exceeded");hash.update(chunk);}
    const after=await handle.stat();
    if(before.size!==bytes||after.size!==bytes||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw new Error("backup_source_changed");
    return {byteLength:bytes,sha256:hash.digest("hex")};
  } finally {await handle.close();}
}
async function inventory(root,budget) {
  const files=[],directories=[];let bytes=0;
  async function visit(relative="") {
    const names=(await fs.readdir(path.join(root,relative))).sort();
    for(const name of names) {
      const rel=relative?relative+"/"+name:name;
      if(!safeRelative(rel))throw new Error("backup_invalid_path");
      if(/\.(?:lock|tmp)$/.test(name))throw new Error("backup_writer_not_quiescent");
      const file=path.join(root,...rel.split("/")),stat=await fs.lstat(file);
      if(stat.isSymbolicLink())throw new Error("backup_symlink_forbidden");
      if(stat.isDirectory()) {directories.push(rel);if(files.length+directories.length>budget.maxEntries)throw new Error("backup_capacity_exceeded");await visit(rel);}
      else if(stat.isFile()) {
        bytes+=stat.size;if(bytes>budget.maxBytes||files.length+directories.length>=budget.maxEntries)throw new Error("backup_capacity_exceeded");
        const hashed=await fileDigest(file,budget.maxBytes);if(hashed.byteLength!==stat.size)throw new Error("backup_source_changed");
        files.push({path:rel,...hashed});
      } else throw new Error("backup_regular_file_required");
    }
  }
  await visit();files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);directories.sort();
  return {files,directories,byteLength:bytes};
}
async function exists(file) {try {await fs.lstat(file);return true;}catch(error){if(error.code==="ENOENT")return false;throw error;}}
async function verifyDomains(root) {
  const report={scope:"all_bytes_and_known_v1_readers_only",history:"absent",sources:[],layers:[],journals:[]};
  try {
    if(await exists(path.join(root,"observations.json"))) {
      const history=new HistoryStore(root);
      if(!history.data||Array.isArray(history.data)||Object.values(history.data).some(value=>!Array.isArray(value)))throw new Error("invalid_history_series");
      for(const key of Object.keys(history.data))history.read(key);
      report.history="compatible_v1";
    }
    for(const origin of ["captured_source","synthetic_fixture"]) {
      for(const namespace of ["sources","layers"]) {
        const store=new RawArtifactStore(root,{origin,namespace,readOnly:true});
        if(!(await exists(store.root)))continue;
        const verified=namespace==="layers"?await new LayerResearchService({store}).verifyArchive():await store.verify();
        report[namespace].push({origin,captures:verified.captures,...(namespace==="layers"?{collections:verified.collections}:{artifacts:verified.artifacts})});
      }
      for(const kind of ["editorial","subscriptions"]) {
        const journal=new AlertJournal(root,{origin,kind,readOnly:true});if(!(await exists(journal.root)))continue;
        const entries=await journal.entries();
        if(kind==="editorial") {editorialState(entries);outboxState(entries);}
        else await new ZoneSubscriptions({journal}).demand();
        report.journals.push({kind,origin,events:entries.length});
      }
    }
    return report;
  } catch {throw new Error("backup_domain_invalid");}
}
async function syncDirectory(directory) {const handle=await fs.open(directory,"r");try {await handle.sync();}finally {await handle.close();}}
async function copyInventory(source,target,expected) {
  for(const directory of expected.directories)await fs.mkdir(path.join(target,...directory.split("/")),{mode:0o700});
  for(const file of expected.files) {
    const input=path.join(source,...file.path.split("/")),output=path.join(target,...file.path.split("/"));
    let byteLength=0;
    const bounded=new Transform({transform(chunk,encoding,callback){byteLength+=chunk.length;callback(byteLength>file.byteLength?new Error("backup_source_changed"):null,chunk);}});
    await pipeline(createReadStream(input,{flags:constants.O_RDONLY|constants.O_NOFOLLOW}),bounded,createWriteStream(output,{flags:"wx",mode:0o600}));
    const handle=await fs.open(output,"r");try {await handle.sync();}finally {await handle.close();}
    const copied=await fileDigest(output,file.byteLength);
    if(copied.sha256!==file.sha256||copied.byteLength!==file.byteLength)throw new Error("backup_source_changed");
  }
  for(const directory of [target,...expected.directories.map(d=>path.join(target,...d.split("/")))].reverse())await syncDirectory(directory);
}
const summary=(manifest,domainChecks)=>({version:1,status:"verified",fileCount:manifest.files.length,directoryCount:manifest.directories.length,byteLength:manifest.byteLength,
  createdAt:manifest.createdAt,consistency:manifest.consistency,domainChecks,alertsPublishEnabled:false,dispatchMode:"DRY_RUN"});
export async function createDataBackup({sourceDir,snapshotDir,quiesced=false,now=()=>new Date().toISOString(),...options}={}) {
  if(quiesced!==true)throw new Error("backup_quiescence_required");
  const budget=limits(options),source=await realDirectory(sourceDir),before=await inventory(source,budget),createdAt=now();
  if(!Number.isFinite(utcMillis(createdAt)))throw new Error("backup_invalid_clock");
  await verifyDomains(source);
  const target=await newDestination(snapshotDir,source),data=path.join(target,"data");await fs.mkdir(data,{mode:0o700});
  await copyInventory(source,data,before);
  if(!isDeepStrictEqual(await inventory(source,budget),before)||!isDeepStrictEqual(await inventory(data,budget),before))throw new Error("backup_source_changed");
  const domainChecks=await verifyDomains(data);
  const manifest={version:1,createdAt,consistency:"quiescence_asserted_double_inventory_verified",...before};
  const manifestBytes=Buffer.from(JSON.stringify({...manifest,checksum:digest(manifest)}));
  if(manifestBytes.length>32*1024*1024)throw new Error("backup_capacity_exceeded");
  await createImmutableFile(path.join(target,manifestName),manifestBytes);
  await syncDirectory(target);
  return summary(manifest,domainChecks);
}
async function verifiedSnapshot(snapshotDir,budget) {
  const root=await realDirectory(snapshotDir);
  if(!isDeepStrictEqual((await fs.readdir(root)).sort(),[manifestName,"data"].sort()))throw new Error("backup_invalid_layout");
  const file=path.join(root,manifestName),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024)throw new Error("backup_invalid_manifest");
  const {checksum,...manifest}=JSON.parse(await fs.readFile(file,"utf8"));
  if(Object.keys(manifest).some(k=>!["version","createdAt","consistency","files","directories","byteLength"].includes(k))||manifest.version!==1||checksum!==digest(manifest)||
    !Number.isFinite(utcMillis(manifest.createdAt))||manifest.consistency!=="quiescence_asserted_double_inventory_verified"||!Array.isArray(manifest.files)||!Array.isArray(manifest.directories)||
    manifest.files.length+manifest.directories.length>budget.maxEntries||!Number.isSafeInteger(manifest.byteLength)||manifest.byteLength<0||manifest.byteLength>budget.maxBytes||
    manifest.files.some(f=>!f||Object.keys(f).some(k=>!["path","byteLength","sha256"].includes(k))||!safeRelative(f.path)||!Number.isSafeInteger(f.byteLength)||f.byteLength<0||typeof f.sha256!=="string"||!/^[a-f0-9]{64}$/.test(f.sha256))||manifest.directories.some(d=>!safeRelative(d)))throw new Error("backup_invalid_manifest");
  const data=await realDirectory(path.join(root,"data")),actual=await inventory(data,budget);
  if(!isDeepStrictEqual(actual,{files:manifest.files,directories:manifest.directories,byteLength:manifest.byteLength}))throw new Error("backup_integrity_failed");
  return {root,data,manifest,domainChecks:await verifyDomains(data)};
}
export async function verifyDataBackup({snapshotDir,...options}={}) {
  const verified=await verifiedSnapshot(snapshotDir,limits(options));return summary(verified.manifest,verified.domainChecks);
}
export async function restoreDataBackup({snapshotDir,destinationDir,...options}={}) {
  const budget=limits(options),verified=await verifiedSnapshot(snapshotDir,budget),destination=await newDestination(destinationDir,verified.root);
  await copyInventory(verified.data,destination,verified.manifest);
  const actual=await inventory(destination,budget);
  if(!isDeepStrictEqual(actual,{files:verified.manifest.files,directories:verified.manifest.directories,byteLength:verified.manifest.byteLength}))throw new Error("backup_integrity_failed");
  const domainChecks=await verifyDomains(destination);
  await verifiedSnapshot(snapshotDir,budget);
  return {...summary(verified.manifest,domainChecks),status:"restored_to_new_directory",serviceStarted:false};
}
