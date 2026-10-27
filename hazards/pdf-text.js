import {Worker} from "node:worker_threads";

export function extractPdfText(bytes,{timeoutMs=12000}={}) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL("./pdf-worker.js",import.meta.url),{
      workerData:bytes,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128},stdout:true,stderr:true});
    // Bounded diagnostics: never forward document/library output to app logs.
    worker.stdout.resume();worker.stderr.resume();
    let received=false;
    const timer=setTimeout(()=>{worker.terminate();reject(new Error("pdf_extraction_timeout"));},timeoutMs);
    worker.once("message",message=>{
      received=true;
      clearTimeout(timer); worker.terminate();
      if(typeof message.text==="string") resolve(message.text);
      else reject(new Error("pdf_extraction_failed"));
    });
    worker.once("error",()=>{clearTimeout(timer);reject(new Error("pdf_extraction_failed"));});
    worker.once("exit",()=>{clearTimeout(timer);if(!received) reject(new Error("pdf_extraction_failed"));});
  });
}
