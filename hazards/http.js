import { SourceRegistry } from "./registry.js";

export class SourceHttp {
  constructor({registry=new SourceRegistry(),httpFetch=fetch,now=()=>new Date(),random=Math.random}={}) {
    Object.assign(this,{registry,httpFetch,now,random});
    this.states=new Map(); this.hostPause=new Map(); this.active=new Set();
  }
  nextAllowedAt(sourceId) {
    const host=new URL(this.registry.get(sourceId).url).hostname;
    const time=Math.max(this.states.get(sourceId)?.nextAttempt||0,this.hostPause.get(host)||0);
    return time?new Date(time).toISOString():null;
  }
  async get(sourceId,request,{signal}={}) {
    const source=this.registry.get(sourceId);
    const requestUrl=this.registry.requestUrl(sourceId,request);
    const host=new URL(source.url).hostname;
    const started=this.now().getTime();
    const state=this.states.get(sourceId)||{failures:0,nextAttempt:0};
    if(started<Math.max(state.nextAttempt,this.hostPause.get(host)||0)) throw new Error("source_cooldown");
    if(this.active.has(host)) throw new Error("source_busy");
    this.active.add(host);
    let response;
    try {
      response=await this.httpFetch(requestUrl,{method:"GET",redirect:"manual",
        signal:signal?AbortSignal.any([signal,AbortSignal.timeout(source.timeoutMs)]):AbortSignal.timeout(source.timeoutMs),headers:{accept:source.type==="pdf"?"application/pdf":"application/json"}});
      if(response.status===429 || response.status===403) {
        const retry=response.headers.get("retry-after");
        const numeric=/^\d+$/.test(retry||"");
        const delay=numeric?Number(retry)*1000:Date.parse(retry)-started;
        this.hostPause.set(host,Math.min(253402300799999,started+Math.max(source.cooldownMs,
          Number.isFinite(delay)?delay:numeric?253402300799999:0)));
      }
      if(!response.ok || response.status>=300) throw new Error("http_"+response.status);
      const declared=Number(response.headers.get("content-length"));
      if(declared>source.maxBytes) throw new Error("body_too_large");
      let size=0; const chunks=[];
      for await(const chunk of response.body||[]) {
        size+=chunk.length;
        if(size>source.maxBytes) throw new Error("body_too_large");
        chunks.push(Buffer.from(chunk));
      }
      if(!size) throw new Error("empty_body");
      const retrievedAt=this.now().toISOString();
      this.states.set(sourceId,{failures:0,nextAttempt:started+source.cooldownMs});
      return {bytes:Buffer.concat(chunks,size),retrievedAt,sourceUrl:requestUrl,
        elapsedMs:Math.max(0,this.now().getTime()-started),httpStatus:response.status,
        mediaType:(response.headers.get("content-type")||"application/octet-stream").split(";")[0],
        etag:response.headers.get("etag"),lastModified:response.headers.get("last-modified")};
    } catch(error) {
      const failures=state.failures+1;
      this.states.set(sourceId,{failures,nextAttempt:started+Math.min(86400000,
        source.cooldownMs*2**Math.min(failures-1,8))*(1+this.random()*0.2)});
      const code=/^(http_\d{3}|body_too_large|empty_body)$/.test(error?.message)?error.message:
        error?.name==="TimeoutError"?"timeout":"network_or_read_error";
      throw new Error(code);
    } finally {
      if(response?.body && !response.bodyUsed) await response.body.cancel().catch(()=>{});
      this.active.delete(host);
    }
  }
}
