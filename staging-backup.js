import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createDataBackup,verifyDataBackup,restoreDataBackup} from "./backup.js";
import {verifySnapshot} from "./storage/backups.js";

// The staging contract fixes DB_DIR below DATA_DIR. Online SQLite snapshots remain
// a separate v5 capability; this combined backup deliberately requires shutdown.
async function sqliteState(root,{verify=false}={}) {
  const directory=path.join(root,"v5");
  let stat;try {stat=await fs.lstat(directory);}catch(error){if(error.code==="ENOENT")return {status:"not_present"};throw error;}
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error("staging_sqlite_layout_invalid");
  for(const suffix of ["-wal","-shm","-journal"]) {
    try {await fs.lstat(path.join(directory,"aegis-v5.sqlite"+suffix));throw Error("staging_sqlite_not_quiescent");}
    catch(error){if(error.code!=="ENOENT")throw error;}
  }
  const file=path.join(directory,"aegis-v5.sqlite");
  try {stat=await fs.lstat(file);}catch(error){if(error.code==="ENOENT")return {status:"not_present"};throw error;}
  if(!stat.isFile()||stat.isSymbolicLink())throw Error("staging_sqlite_layout_invalid");
  if(!verify)return {status:"present_not_yet_verified"};
  // Even a readonly SQLite connection may create WAL/SHM sidecars. Inspect an
  // owned private copy so verification cannot alter a hashed backup inventory.
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-staging-sqlite-check-"));
  try {
    const copy=path.join(scratch,"aegis-v5.sqlite");await fs.copyFile(file,copy);await fs.chmod(copy,0o600);
    return {status:"integrity_and_migrations_verified",migrationCount:verifySnapshot(copy)};
  }catch {throw Error("staging_sqlite_integrity_failed");}
  finally {await fs.rm(scratch,{recursive:true,force:true});}
}
export async function createStagingBackup(options) {
  if(options.quiesced!==true)throw Error("backup_quiescence_required");
  await sqliteState(options.sourceDir);
  const result=await createDataBackup(options);
  const sqlite=await sqliteState(path.join(options.snapshotDir,"data"),{verify:true});
  return {...result,sqlite,scope:"combined_staging_DATA_DIR_with_v5_child",serviceStarted:false};
}
export async function verifyStagingBackup(options) {
  const result=await verifyDataBackup(options),sqlite=await sqliteState(path.join(options.snapshotDir,"data"),{verify:true});
  return {...result,sqlite,scope:"combined_staging_DATA_DIR_with_v5_child",serviceStarted:false};
}
export async function restoreStagingBackup(options) {
  await verifyStagingBackup(options);
  const result=await restoreDataBackup(options),sqlite=await sqliteState(options.destinationDir,{verify:true});
  return {...result,sqlite,scope:"combined_staging_DATA_DIR_with_v5_child",serviceStarted:false};
}
