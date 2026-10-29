import fs from 'node:fs/promises';
import path from 'node:path';
import {readCheckpoint,writeCheckpoint} from './shadow-runner.js';

const proc=async file=>{try{return await fs.readFile(file,'utf8');}catch{return null;}};
export async function measureProcess() {
  const io=await proc('/proc/self/io'),net=await proc('/proc/self/net/dev');
  const [cCpu,cMem,cIo]=await Promise.all([proc('/sys/fs/cgroup/cpu.stat'),proc('/sys/fs/cgroup/memory.current'),proc('/sys/fs/cgroup/io.stat')]);
  const [cMax,cEvents,cPids]=await Promise.all([proc('/sys/fs/cgroup/memory.max'),proc('/sys/fs/cgroup/memory.events'),proc('/sys/fs/cgroup/pids.current')]);
  const counters=Object.fromEntries((io||'').trim().split('\n').map(l=>l.split(':').map(s=>s.trim())).filter(a=>a.length===2).map(([k,v])=>[k,Number(v)]));
  let rx=0,tx=0;
  for(const line of (net||'').split('\n').slice(2)) {
    const columns=line.trim().split(/\s+/);if(columns.length<17)continue;
    rx+=Number(columns[1]);tx+=Number(columns[9]);
  }
  return {sampledAt:new Date().toISOString(),uptimeSeconds:process.uptime(),cpuMicroseconds:process.cpuUsage(),
    rssBytes:process.memoryUsage().rss,heapUsedBytes:process.memoryUsage().heapUsed,
    processIo:io?{readBytes:counters.read_bytes,writeBytes:counters.write_bytes,writeCharacters:counters.wchar}:null,
    cgroupNamespace:{cpuUsageMicroseconds:cCpu?.match(/^usage_usec (\d+)/m)?Number(cCpu.match(/^usage_usec (\d+)/m)[1]):null,
      memoryBytes:cMem?Number(cMem.trim()):null,
      memoryLimitBytes:cMax&&/^\d+\s*$/.test(cMax)?Number(cMax.trim()):null,
      oomKills:cEvents?.match(/^oom_kill (\d+)/m)?Number(cEvents.match(/^oom_kill (\d+)/m)[1]):null,
      pids:cPids?Number(cPids.trim()):null,
      io:cIo?{readBytes:[...cIo.matchAll(/rbytes=(\d+)/g)].reduce((s,m)=>s+Number(m[1]),0),writeBytes:[...cIo.matchAll(/wbytes=(\d+)/g)].reduce((s,m)=>s+Number(m[1]),0)}:null},
    networkNamespaceBytes:net?{rx,tx}:null,powerWatts:null,energyWh:null};
}

// Actual UTC day, never the accelerated scheduler clock. Cumulative counters
// are retained; null electrical measurements must not be estimated from CPU.
export async function recordDailyMeasurement(root,report) {
  const day=report.actualReportedAt?.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(report.actualReportedAt)))throw Error('invalid_measurement_time');
  const directory=path.join(root,'daily');await fs.mkdir(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,day+'.json'),names=await fs.readdir(directory);
  if(!names.includes(day+'.json')&&names.length>=16)throw Error('daily_measurement_capacity');
  let old;try{old=await readCheckpoint(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  const sample={at:report.actualReportedAt,actualStartedAt:report.actualStartedAt,totals:report.totals,resources:report.resources??null,heartbeatAt:report.heartbeatAt};
  await writeCheckpoint(file,{version:1,day,mode:report.mode,clockMode:report.clockMode,samples:(old?.samples||0)+1,
    sources:report.daily?.[day]?.sources??old?.sources??{},
    first:old?.first||sample,last:sample,powerWatts:null,energyWh:null,
    warning:'Process counters may reset on restart; subtract only within the same actualStartedAt',actualStartedAt:report.actualStartedAt,
    processRestartSinceFirst:old?old.processRestartSinceFirst||old.actualStartedAt!==report.actualStartedAt:false});
  // A request reserved before midnight can finish after it. Update its original
  // day's aggregate without inventing a pre-midnight resource sample.
  for(const [sourceDay,aggregate] of Object.entries(report.daily||{})) {
    if(sourceDay===day)continue;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(sourceDay))throw Error('invalid_measurement_day');
    const target=path.join(directory,sourceDay+'.json');let prior;
    try{prior=await readCheckpoint(target);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(JSON.stringify(prior?.sources)===JSON.stringify(aggregate.sources))continue;
    if(!prior&&(await fs.readdir(directory)).length>=16)throw Error('daily_measurement_capacity');
    await writeCheckpoint(target,{...(prior||{version:1,day:sourceDay,mode:report.mode,clockMode:report.clockMode,samples:0,first:null,last:null,
      powerWatts:null,energyWh:null}),sources:aggregate.sources,sourceAggregateUpdatedAt:report.actualReportedAt});
  }
}
