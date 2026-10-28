// Liveness of the local app only; never checks or refreshes external sources.
try {
  const response=await fetch("http://127.0.0.1:3010/api/v1/health/public",{signal:AbortSignal.timeout(3000)});
  const body=await response.json();
  if(response.status!==200||body.api_version!=="1"||body.status!=="foundation"||body.coverage!=="unknown")throw Error();
  console.log(JSON.stringify({status:"app_alive",sourceCoverage:"not_certified",dispatchMode:"DRY_RUN"}));
}catch {console.error("Staging application health unavailable");process.exitCode=1;}
