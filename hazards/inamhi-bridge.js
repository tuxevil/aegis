import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RawArtifactStore} from './artifact-store.js';
import {IngestionService} from './ingestion.js';
import {SourceHttp} from './http.js';
import {SourceRegistry} from './registry.js';
import {createImmutableFile} from './immutable-file.js';
import {pinnedInamhiFetch,publicIPv4} from './inamhi-transport.js';
import {utcMillis} from './time.js';

export function validateInamhiAuthorization(p,now=Date.now()) {
  const fields=['status','sourceId','maxRequests','dispatchMode','alertsPublishEnabled','scope','expiresAt','ownerApprovalReference','dataRightsReference','networkVerificationReference','approvedAddresses'];
  if(!p||fields.some(k=>!Object.hasOwn(p,k))||Object.keys(p).some(k=>!fields.includes(k)))throw Error('inamhi_authorization_required');
  if(p?.status!=='approved_single_manual_query'||p.sourceId!=='inamhi.warning.pdf'||p.maxRequests!==1||
    p.dispatchMode!=='DRY_RUN'||p.alertsPublishEnabled!==false||p.scope!=='private_research_archive'||
    !Number.isFinite(utcMillis(p.expiresAt))||utcMillis(p.expiresAt)<=now||utcMillis(p.expiresAt)>now+86400000||
    ['ownerApprovalReference','dataRightsReference','networkVerificationReference'].some(k=>typeof p[k]!=='string'||p[k].length<4||p[k].length>200||/pending|not_authorized/i.test(p[k]))||
    !Array.isArray(p.approvedAddresses)||!p.approvedAddresses.length||p.approvedAddresses.some(ip=>!publicIPv4(ip)))throw Error('inamhi_authorization_required');
  return structuredClone(p);
}

// Constructing a bridge does not query DNS or HTTP. No CLI/scheduler enables it.
// Approval references are operator records, not machine-verifiable permission.
export function createInamhiBridge({root,authorization,lookup,request,now=()=>new Date()}={}) {
  const policy=validateInamhiAuthorization(authorization,now().getTime()),registry=new SourceRegistry();
  const store=new RawArtifactStore(root,{origin:'captured_source',maxCaptures:4,maxBytes:4*1024*1024});
  const http=new SourceHttp({registry,now,httpFetch:pinnedInamhiFetch({approvedAddresses:policy.approvedAddresses,lookup,request})});
  const ingestion=new IngestionService({store,http,registry,now,networkEnabled:true,allowPendingLicense:true});
  const poll=async(provider,{signal}={})=>{
    validateInamhiAuthorization(policy,now().getTime());
    if(provider.sourceId!=='inamhi.warning.pdf')throw Error('inamhi_source_required');
    await store.initialize();
    // One authorization permits ONE lifetime attempt, even after failure/crash.
    // No automatic retry, no daily reset. A new request needs separate review.
    await createImmutableFile(path.join(store.root,'manual-attempt.json'),JSON.stringify({at:now().toISOString(),
      approvalHash:createHash('sha256').update(policy.ownerApprovalReference).digest('hex')}));
    const directory=await fs.open(store.root,'r');try{await directory.sync();}finally{await directory.close();}
    const before=Date.now(),result=await ingestion.ingest('inamhi.warning.pdf',undefined,{signal});
    if(!result.captureId) {
      const failures=await store.records('failures'),failed=failures.at(-1);
      return {status:'unknown',responseBytes:0,httpStatus:/^http_\d{3}$/.test(result.errorCode)?Number(result.errorCode.slice(5)):undefined,
        retryAfterMs:failed?.retryAt?Math.max(0,Date.parse(failed.retryAt)-now().getTime()):undefined,errorCode:result.errorCode};
    }
    const record=(await store.records()).find(r=>r.id===result.captureId);
    return {status:'ok',httpStatus:200,responseBytes:record.envelope.raw.byteLength,artifactSha256:record.sha256,captureId:record.id,
      sourceDataStatus:record.envelope.quality.dataStatus,elapsedMs:Date.now()-before};
  };
  Object.defineProperty(poll,'recordOrigin',{value:'captured_source'});
  return {poll,store,policy};
}

export async function createManualInamhiRunner(options) {
  const bridge=createInamhiBridge(options),{ShadowRunner}=await import('./shadow-runner.js');
  await fs.mkdir(options.root,{recursive:true,mode:0o700});
  const stat=await fs.lstat(options.root);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('private_manual_root_required');
  const marker=path.join(options.root,'inamhi-manual.format.json'),names=await fs.readdir(options.root);
  const approvalHash=createHash('sha256').update(bridge.policy.ownerApprovalReference).digest('hex');
  if(!names.includes('inamhi-manual.format.json')) {
    if(names.length)throw Error('new_manual_root_required');
    await createImmutableFile(marker,JSON.stringify({version:1,approvalHash}));
  }else {
    const st=await fs.lstat(marker);if(!st.isFile()||st.isSymbolicLink()||st.size>1000)throw Error('invalid_manual_marker');
    const saved=JSON.parse(await fs.readFile(marker,'utf8'));if(saved.version!==1||saved.approvalHash!==approvalHash)throw Error('manual_approval_mismatch');
  }
  const runner=new ShadowRunner({root:path.join(options.root,'inamhi-manual-scheduler'),poll:bridge.poll,manualAuthorization:bridge.policy,
    plan:{version:1,mode:'captured_source',alertsPublishEnabled:false,dispatchMode:'DRY_RUN',hostIntervalMs:300000,maxDiskBytes:16*1024*1024,maxEvents:10,
      providers:[{key:'inamhi.manual',sourceId:'inamhi.warning.pdf',intervalMs:3600000,dailyBudget:1,timeoutMs:12000,maxResponseBytes:2000000,ttlMs:3600000}]}});
  return {...bridge,runner};
}
