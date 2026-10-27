import {parentPort,workerData} from "node:worker_threads";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {joinPdfItems} from "./pdf-layout.js";

let task;
try {
  task=getDocument({data:new Uint8Array(workerData),isEvalSupported:false,
    useWorkerFetch:false,useSystemFonts:false,disableFontFace:true,stopAtErrors:true,verbosity:0});
  const doc=await task.promise;
  if(doc.numPages>5) throw new Error("pdf_page_limit");
  let text="";
  for(let page=1;page<=doc.numPages;page++) {
    const content=await (await doc.getPage(page)).getTextContent();
    text+=joinPdfItems(content.items)+"\n";
    if(text.length>100000) throw new Error("pdf_text_limit");
  }
  parentPort.postMessage({text});
} catch {
  parentPort.postMessage({error:"pdf_extraction_failed"});
} finally { await task?.destroy(); }
