import https from 'node:https';
import dns from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {SourceRegistry} from './registry.js';

const denied=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],
  ['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],
  ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])denied.addSubnet(ip,bits,'ipv4');
export const publicIPv4=ip=>typeof ip==='string'&&isIP(ip)===4&&!denied.check(ip,'ipv4');

export function pinnedInamhiFetch({approvedAddresses,lookup=dns.lookup,request=https.request}={}) {
  if(!Array.isArray(approvedAddresses)||!approvedAddresses.length||approvedAddresses.length>4||approvedAddresses.some(ip=>!publicIPv4(ip)))throw Error('invalid_approved_addresses');
  const approved=new Set(approvedAddresses),url=new SourceRegistry().get('inamhi.warning.pdf').url,host=new URL(url).hostname;
  return async(input,options={})=>{
    if(input!==url||options.method!=='GET'||options.redirect!=='manual'||!options.signal)throw Error('inamhi_request_not_registered');
    options.signal.throwIfAborted();
    const answers=await new Promise((resolve,reject)=>{
      const abort=()=>reject(options.signal.reason);
      options.signal.addEventListener('abort',abort,{once:true});
      Promise.resolve().then(()=>lookup(host,{all:true,verbatim:true})).then(resolve,reject).finally(()=>options.signal.removeEventListener('abort',abort));
    });
    options.signal.throwIfAborted();
    if(!Array.isArray(answers)||!answers.length||answers.length>8||answers.some(a=>a.family!==4||!publicIPv4(a.address)||!approved.has(a.address)))throw Error('dns_change_or_private_address');
    const pinned=answers[0].address;
    return new Promise((resolve,reject)=>{
      const req=request(url,{method:'GET',agent:false,family:4,autoSelectFamily:false,rejectUnauthorized:true,servername:host,
        maxHeaderSize:16384,signal:options.signal,
        lookup:(_name,_opts,done)=>done(null,pinned,4),
        headers:{accept:'application/pdf','user-agent':'AEGIS research (https://github.com/tuxevil/aegis; manual-only)'}},res=>{
        const headers=new Headers();
        for(const key of ['content-type','content-length','etag','last-modified','retry-after','date'])if(typeof res.headers[key]==='string')headers.set(key,res.headers[key]);
        try{
          let body=null;
          if(res.statusCode<200||res.statusCode>=300||[204,205].includes(res.statusCode))res.destroy();
          else {
            const iterator=res[Symbol.asyncIterator]();let ended=false;
            body=new ReadableStream({
              async pull(controller){try{const item=await iterator.next();if(ended)return;if(item.done){ended=true;controller.close();}else controller.enqueue(item.value);}catch(e){if(!ended){ended=true;controller.error(e);}}},
              async cancel(){ended=true;res.destroy();try{await iterator.return();}catch{}}
            });
          }
          resolve(new Response(body,{status:res.statusCode,headers}));
        }
        catch(e){res.destroy();reject(e);}
      });
      req.once('error',reject);req.end();
    });
  };
}
