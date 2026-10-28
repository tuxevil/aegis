import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const args=process.argv.slice(2);
if(!args.length)console.log("Local Docker staging aggregates only. Use --run; no credentials, network access or host ports are changed.");
else {
  try {
    if(args.length!==1||args[0]!=="--run"||process.env.DOCKER_HOST||(process.env.DOCKER_CONTEXT&&process.env.DOCKER_CONTEXT!=="default"))throw Error();
    const command=(...argv)=>execFileSync("docker",["--context","default",...argv],{encoding:"utf8",timeout:15000,maxBuffer:65536}).trim();
    const compose=fileURLToPath(new URL("../deploy/staging/compose.yaml",import.meta.url));
    const id=command("compose","-f",compose,"ps","-q","aegis");if(!/^[a-f0-9]{12,64}$/.test(id))throw Error();
    const format='{"labels":{{json .Config.Labels}},"status":{{json .State.Status}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"memory":{{json .HostConfig.Memory}},"nanoCpus":{{json .HostConfig.NanoCpus}},"image":{{json .Image}}}';
    const info=JSON.parse(command("inspect","--format",format,id));
    if(info.labels?.["com.docker.compose.project"]!=="aegis-supervised-staging"||info.labels?.["org.aegis.stage"]!=="supervised-offline"||info.network!=="none"||Object.keys(info.ports??{}).length)throw Error();
    const stats=JSON.parse(command("stats","--no-stream","--format","{{json .}}",id));
    const usage=command("exec",id,"du","-sk","/data");if(!/^\d+\s+\/data$/.test(usage))throw Error();
    const quality=JSON.parse(command("exec",id,"node","--input-type=module","-e",
      'const r=await fetch("http://127.0.0.1:3010/api/v1/health/quality",{signal:AbortSignal.timeout(3000)});if(!r.ok)throw Error("health");console.log(JSON.stringify(await r.json()));'));
    console.log(JSON.stringify({measuredAt:new Date().toISOString(),profile:"local_development_supervised_offline",imageId:info.image,
      status:info.status,health:info.health,limits:{memoryBytes:info.memory,cpuCores:info.nanoCpus/1e9},
      sample:{cpuPercent:stats.CPUPerc,memory:stats.MemUsage,memoryPercent:stats.MemPerc,pids:stats.PIDs,
        networkIO:stats.NetIO,blockIO:stats.BlockIO,dataAllocatedKiB:Number(usage.split(/\s+/)[0])},
      application:quality,networkMode:info.network,publishedHostPorts:0,powerWatts:null,energyWh:null,
      caveats:["One Docker sample, not load capacity or a long-term/energy measurement",
        "Source attempts include failures; network isolation does not imply no attempted fetches",
        "No battery, solar inverter, HA, WAHA or Proxmox measurements were accessed"],dispatchMode:"DRY_RUN"},null,2));
  }catch {console.error("Staging profile refused: verify the local isolated compose project. No configuration changed.");process.exitCode=1;}
}
