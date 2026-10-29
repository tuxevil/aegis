// One-shot TLS diagnostics only. No HTTP, source refresh or certificate bypass.
import tls from 'node:tls';
const args=process.argv.slice(2);
if(!args.length)console.log('No network by default. --tls-only checks three fixed public Grid endpoints once.');
else if(args.length!==1||args[0]!=='--tls-only'){console.error('Only --tls-only is supported');process.exitCode=1;}
else {
  const results=await Promise.all([['generacioncsr.celec.gob.ec',443],['generacioncsr.celec.gob.ec',8443],['www.cenace.gob.ec',443]].map(([host,port])=>new Promise(resolve=>{
    const socket=tls.connect({host,port,servername:host,rejectUnauthorized:true},()=>{
      const cert=socket.getPeerCertificate();socket.end();resolve({host,port,status:'verified_tls',authorized:socket.authorized,validTo:cert.valid_to??null,issuer:cert.issuer?.O??null});
    });
    socket.setTimeout(6000,()=>socket.destroy(Object.assign(Error('timeout'),{code:'TLS_TIMEOUT'})));
    socket.once('error',e=>resolve({host,port,status:'failed',code:e.code??'tls_error'}));
  })));
  console.log(JSON.stringify({at:new Date().toISOString(),httpRequests:0,verificationBypass:false,results},null,2));
}
