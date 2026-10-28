import {createHash,timingSafeEqual} from "node:crypto";
const sha=value=>createHash("sha256").update(value).digest();
// Configuration contains digests, not browser credentials. Generate the token
// outside this app; bearer values are accepted only in Authorization, never URLs.
export function createAdminAuthenticator(credentials) {
  if(!Array.isArray(credentials)||credentials.length<1||credentials.length>20)throw new Error("admin_credentials_required");
  const ids=new Set(),digests=new Set();
  const configured=credentials.map(c=>{
    if(!c||Object.keys(c).some(k=>!["id","role","tokenSha256"].includes(k))||typeof c.id!=="string"||!/^[a-zA-Z0-9._-]{1,80}$/.test(c.id)||!["editor","approver"].includes(c.role)||typeof c.tokenSha256!=="string"||!/^[a-f0-9]{64}$/.test(c.tokenSha256)||ids.has(c.id)||digests.has(c.tokenSha256))throw new Error("invalid_admin_credentials");
    ids.add(c.id);digests.add(c.tokenSha256);return {actor:{id:c.id,role:c.role},digest:Buffer.from(c.tokenSha256,"hex")};
  });
  return header=>{
    if(typeof header!=="string"||!/^Bearer [a-zA-Z0-9_-]{43,128}$/.test(header))return null;
    const received=sha(header.slice(7));let actor=null;
    for(const credential of configured)if(timingSafeEqual(received,credential.digest))actor=credential.actor;
    return actor?{...actor}:null;
  };
}
