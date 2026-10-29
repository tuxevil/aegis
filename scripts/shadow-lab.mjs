import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {ShadowRunner,readCheckpoint,writeCheckpoint} from '../hazards/shadow-runner.js';
import {measureProcess,recordDailyMeasurement} from '../hazards/operational-metrics.js';
import {RawArtifactStore} from '../hazards/artifact-store.js';
import {IngestionService} from '../hazards/ingestion.js';
import {assessArchive} from '../hazards/assess.js';
import {createImmutableFile} from '../hazards/immutable-file.js';
import {syntheticBulletin} from '../hazards/fixtures/pdf.js';
import {beginRun,finishRun,resourceStop,restartBudgetExceeded} from '../hazards/shadow-run-lifecycle.js';

// This executable never constructs SourceHttp for network use. No live mode,
// URL arguments, credentials, configuration approval or publisher is accepted.
export async function main(args=process.argv.slice(2)) {
  if(!args.length){console.log('Blocked by default. Offline only: --lab --root=NEW_PRIVATE_DIR with --cycles=12 OR --wall-clock --days=7');return;}
  const allowed=a=>a==='--lab'||a==='--wall-clock'||a==='--short-fixture'||['--root=','--cycles=','--days=','--seconds='].some(k=>a.startsWith(k));
  if(args.some(a=>!allowed(a))||!args.includes('--lab')||new Set(args.map(a=>a.split('=')[0])).size!==args.length)throw Error('invalid_lab_arguments');
  const value=k=>args.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3);
  const root=value('root'),wall=args.includes('--wall-clock'),days=Number(value('days')||7),cycles=Number(value('cycles')||12);
  if(!root||!Number.isSafeInteger(cycles)||cycles<1||cycles>1000||!Number.isSafeInteger(days)||days<7||days>14||(!wall&&value('days'))||(wall&&value('cycles')))throw Error('invalid_lab_arguments');
  const short=args.includes('--short-fixture'),seconds=Number(value('seconds'));
  if(short?(!wall||!Number.isSafeInteger(seconds)||seconds<10||seconds>600||value('days')):value('seconds')!==undefined)throw Error('invalid_lab_arguments');
  const plan=JSON.parse(await fs.readFile(new URL('../deploy/staging/shadow-lab.plan.json',import.meta.url),'utf8'));
  plan.clockMode=wall?'wall_clock':'accelerated_schedule_only';
  if(short){plan.hostIntervalMs=1000;Object.assign(plan.providers[0],{intervalMs:5000,dailyBudget:120,timeoutMs:1000});plan.profile='short-fixture';}
  const startedAt=Date.now(),termination=new AbortController();
  let simulatedNow=startedAt,runner,run,evaluations=0,finishReason='interrupted';
  const store=new RawArtifactStore(path.join(path.resolve(root),'archive'),{origin:'synthetic_fixture',maxCaptures:1000,maxBytes:32*1024*1024});
  const ingestion=new IngestionService({store,networkEnabled:false});
  const stop=()=>{runner?.requestStop();termination.abort();};
  try {
    runner=await new ShadowRunner({root,plan,now:()=>wall?Date.now():simulatedNow,measure:measureProcess,
      poll:async(p,{signal})=>{
        const step=(runner.state.totals.attempts-1)%8;
        if(step===2)return {status:'unknown',httpStatus:429,retryAfterMs:short?10000:3600000,responseBytes:0};
        if(step===3)throw Error('network_or_read_error');
        if(step===5)return {status:'unknown',httpStatus:403,retryAfterMs:short?10000:86400000,responseBytes:0};
        if(signal.aborted)throw Error('timeout');
        const issued=new Date(Date.now()-86400000),until=new Date(Date.now()+86400000);
        const month=d=>new Intl.DateTimeFormat('es',{month:'long',timeZone:'UTC'}).format(d);
        const bytes=syntheticBulletin({number:step>=4?9992:9991,day:String(issued.getUTCDate()),month:month(issued),year:String(issued.getUTCFullYear()),
          validTo:`${until.getUTCDate()} de ${month(until)} de ${until.getUTCFullYear()}`});
        const capture=await ingestion.importFixture(p.sourceId,bytes,{mediaType:'application/pdf'});
        const records=await store.records(),record=records.find(r=>r.id===capture.captureId);
        if(!record)throw Error('invalid_source_envelope');
        const asOf=new Date().toISOString(),results=[];
        for(const area of ['guayaquil','pallatanga'])results.push(await assessArchive({store,area,asOf}));
        const directory=path.join(path.resolve(root),'evaluations');await fs.mkdir(directory,{mode:0o700,recursive:true});
        const files=await fs.readdir(directory);if(files.length>=1000)throw Error('evaluation_capacity');
        const document={version:1,recordOrigin:'synthetic_fixture',actualEvaluatedAt:asOf,
          simulatedScheduleAt:wall?null:new Date(simulatedNow).toISOString(),sourceVersion:record.revision,artifactSha256:record.sha256,
          captureId:record.id,issuedAt:record.envelope.time.issuedAt,retrievedAt:record.retrievedAt,processedAt:record.processedAt,
          availabilityKnownAt:record.retrievedAt,results,alertsPublishEnabled:false,dispatchMode:'DRY_RUN',publicationBlocked:true};
        const encoded=JSON.stringify(document);if(Buffer.byteLength(encoded)>1_000_000)throw Error('evaluation_capacity');
        await createImmutableFile(path.join(directory,record.id+'.json'),encoded);evaluations++;
        return {status:'ok',responseBytes:bytes.length,httpStatus:200,artifactSha256:record.sha256};
      }}).open();
    if(!wall)simulatedNow=Math.max(simulatedNow,runner.state.lastClock+plan.providers[0].intervalMs);
    run=await beginRun(path.resolve(root),{at:startedAt,durationMs:wall?(short?seconds*1000:days*86400000):null,heartbeatAt:runner.state.heartbeatAt});
    if(restartBudgetExceeded(run,startedAt)){runner.state.stoppedReason='restart_budget';await runner.save();}
    process.on('SIGTERM',stop);process.on('SIGINT',stop);
    const deadline=run.deadline;
    let report;
    for(let cycle=0;!termination.signal.aborted&&(wall?Date.now()<deadline:cycle<cycles);cycle++) {
      const checked=resourceStop(await measureProcess(),runner.state.resourceGuard,Date.now());runner.state.resourceGuard=checked.state;
      if(checked.reason){runner.state.stoppedReason=checked.reason;await runner.save();}
      const tick=await runner.tick();
      report={version:1,mode:'synthetic_fixture',actualStartedAt:new Date(startedAt).toISOString(),actualReportedAt:new Date().toISOString(),
        actualElapsedSeconds:(Date.now()-startedAt)/1000,clockMode:wall?'wall_clock':'accelerated_schedule_only',
        experimentStartedAt:new Date(run.initialStartedAt).toISOString(),experimentDeadline:deadline===null?null:new Date(deadline).toISOString(),processSegments:run.segments,
        simulatedElapsedSeconds:wall?null:(simulatedNow-startedAt)/1000,localEvaluationFilesCreatedThisProcess:evaluations,
        externalRequests:0,precisionMetrics:{falsePositiveRate:null,falseNegativeRate:null,leadTime:null},...tick};
      await writeCheckpoint(path.join(path.resolve(root),'report.json'),report);
      await recordDailyMeasurement(path.resolve(root),report);
      if(tick.stoppedReason)break;
      if(wall)await sleep(Math.max(0,Math.min(short?1000:60000,deadline-Date.now())),undefined,{signal:termination.signal}).catch(e=>{if(e.name!=='AbortError')throw e;});
      else simulatedNow+=plan.providers[0].intervalMs;
    }
    finishReason=runner.state.stoppedReason?'critical_stop':termination.signal.aborted?'signal':wall?'deadline':'cycles_completed';
    console.log(JSON.stringify({mode:'synthetic_fixture',externalRequests:0,actualElapsedSeconds:(Date.now()-startedAt)/1000,
      totals:runner.state.totals,stoppedReason:runner.state.stoppedReason,publicationBlocked:true,dispatchMode:'DRY_RUN'}));
    return report;
  }finally {
    process.off('SIGTERM',stop);process.off('SIGINT',stop);
    try {
      if(run) {
        await finishRun(path.resolve(root),run,{at:Date.now(),reason:finishReason});
        try {
          const file=path.join(path.resolve(root),'report.json'),last=await readCheckpoint(file);
          await writeCheckpoint(file,{...last,actualEndedAt:new Date().toISOString(),terminationReason:finishReason,processSegments:run.segments});
        }catch(e){if(e.code!=='ENOENT')throw e;}
      }
    }finally{if(runner)await runner.close();}
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error('Offline shadow lab refused or stopped. Inspect private checkpoints; no publication or external polling.');process.exitCode=1;});
