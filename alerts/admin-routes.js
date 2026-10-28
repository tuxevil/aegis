import fs from "node:fs";
import {createAdminAuthenticator} from "./auth.js";
import {assessArchive} from "../hazards/assess.js";
import {safeMode} from "../hazards/registry.js";

const properties={type:"object",additionalProperties:false};
const area={type:"string",enum:["guayaquil","pallatanga"]};
const id={type:"string",pattern:"^[a-f0-9]{64}$"};
const query={...properties,properties:{limit:{type:"integer",minimum:1,maximum:50,default:20},offset:{type:"integer",minimum:0,maximum:10000,default:0}}};
const empty={...properties,properties:{}};
const page=(items,{limit=20,offset=0})=>({items:items.slice(offset,offset+limit),total:items.length,limit,offset,...safeMode});
export async function registerAlertAdminRoutes(app,{credentials,editorial,outbox,sourceStore,zoneSubscriptions=null,territoryReader=null,now=()=>new Date().toISOString()}) {
  const authenticate=createAdminAuthenticator(credentials);
  if(!editorial||!outbox||!sourceStore||editorial.journal!==outbox.journal||sourceStore.origin!==editorial.journal.origin)throw new Error("invalid_admin_services");
  await app.register(async scope=>{
    scope.setErrorHandler((error,req,reply)=>{
      if(error.statusCode===429)return reply.code(429).send({error:"admin_rate_limited"});
      if(error.validation||error.statusCode===400||error.statusCode===413)return reply.code(error.statusCode===413?413:400).send({error:"invalid_admin_request"});
      const code=typeof error.message==="string"?error.message:"";
      if(/^(editorial_forbidden|outbox_forbidden)$/.test(code))return reply.code(403).send({error:"admin_forbidden"});
      if(/^(editorial_not_found|outbox_not_found|candidate_not_current)$/.test(code))return reply.code(404).send({error:"admin_not_found"});
      if(/^(invalid_editorial_|editorial_candidate_too_large|outbox_target_not_allowed|invalid_outbox_kind)/.test(code))return reply.code(400).send({error:"invalid_admin_request"});
      if(/^(editorial_(version_conflict|active_revision_exists|candidate_collision|transition_not_allowed|terminal_state|candidate_expired|not_expired|independent_review_required|evidence_not_current)|outbox_(not_approved|not_retracted|no_prior_simulation|expired|evidence_changed))$/.test(code))return reply.code(409).send({error:code});
      return reply.code(503).send({error:"admin_archive_unavailable"});
    });
    const route=(method,url,schema,handler)=>scope.route({method,url,bodyLimit:16384,
      config:{aegisAlertAdmin:true,rateLimit:false},schema,
      onRequest:[async(req,reply)=>{
        reply.header("Cache-Control","no-store").header("Referrer-Policy","no-referrer").header("X-Content-Type-Options","nosniff");
      },scope.rateLimit({max:30,timeWindow:"1 minute",allowList:[]}),async(req,reply)=>{
        req.alertActor=authenticate(req.headers.authorization);
        if(!req.alertActor)return reply.code(401).header("WWW-Authenticate","Bearer").send({error:"admin_authentication_required"});
      }],
      preValidation:async(req,reply)=>{
        for(const [part,definition] of [["query",schema.querystring],["body",schema.body]]) {
          const value=req[part];if(!value)continue;
          if(!definition||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(definition.properties,k)))return reply.code(400).send({error:"invalid_admin_request"});
        }
      },handler});
    if(zoneSubscriptions)route("GET","/api/admin/alerts/demand",{querystring:empty},()=>zoneSubscriptions.demand());
    route("GET","/api/admin/alerts/territory",{querystring:{...properties,required:["area","sourceId"],properties:{area,
      sourceId:{type:"string",enum:["sngr.flood.layer","sngr.multihazard.layer"]},
      limit:{type:"integer",minimum:1,maximum:50,default:20},offset:{type:"integer",minimum:0,maximum:100000,default:0}}}},async req=>{
      if(!territoryReader||territoryReader.store?.origin!==sourceStore.origin)throw new Error("territory_archive_unavailable");
      return territoryReader.read(req.query);
    });
    route("GET","/api/admin/alerts/session",{querystring:empty},req=>({actor:req.alertActor,...safeMode}));
    route("GET","/api/admin/alerts",{querystring:query},async req=>page(await editorial.list(),req.query));
    route("GET","/api/admin/alerts/outbox",{querystring:query},async req=>page(await outbox.list(),req.query));
    route("GET","/api/admin/alerts/candidates",{querystring:{...properties,required:["area"],properties:{area}}},async req=>{
      return assessArchive({store:sourceStore,area:req.query.area,asOf:now()});
    });
    route("POST","/api/admin/alerts/candidates",{querystring:empty,body:{...properties,required:["area","candidateId"],properties:{area,candidateId:id}}},async req=>{
      if(req.alertActor.role!=="editor")throw new Error("editorial_forbidden");
      const assessment=await assessArchive({store:sourceStore,area:req.body.area,asOf:now()});
      const candidate=assessment.candidates.find(c=>c.id===req.body.candidateId);
      if(!candidate)throw new Error("candidate_not_current");
      return editorial.importCandidate(candidate,req.alertActor);
    });
    route("POST","/api/admin/alerts/:id/transitions",{querystring:empty,params:{...properties,required:["id"],properties:{id}},body:{...properties,required:["action","reason","expectedVersion"],properties:{
      action:{type:"string",enum:["submit","approve","return","expire","retract","supersede","note"]},reason:{type:"string",minLength:1,maxLength:2000},expectedVersion:{type:"integer",minimum:1}}}},req=>editorial.transition(req.params.id,req.body,req.alertActor));
    route("POST","/api/admin/alerts/:id/outbox",{querystring:empty,params:{...properties,required:["id"],properties:{id}},body:{...properties,required:["targetId"],properties:{kind:{type:"string",enum:["notice","retraction"]},targetId:{type:"string",pattern:"^simulation-(portal|rss|pwa|waha)-(guayaquil|pallatanga)$"}}}},req=>outbox.enqueue(req.params.id,req.body.targetId,req.alertActor,{kind:req.body.kind}));
    route("POST","/api/admin/alerts/outbox/process",{querystring:empty,body:{...properties,required:["key"],properties:{key:{type:"string",minLength:1,maxLength:300}}}},req=>outbox.process(req.body.key,req.alertActor));
  });
  app.get("/editorial",(_,reply)=>reply.redirect("/editorial/"));
  for(const [url,file,type] of [["/editorial/","editorial.html","text/html"],["/editorial/app.js","editorial.js","text/javascript"],["/editorial/style.css","editorial.css","text/css"],["/editorial/territory/","territory.html","text/html"],["/editorial/territory/app.js","territory.js","text/javascript"],["/editorial/territory/style.css","territory.css","text/css"]]) {
    app.get(url,(_,reply)=>reply.type(type).header("Cache-Control","no-store").header("Referrer-Policy","no-referrer")
      .header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
      .send(fs.readFileSync(new URL(`../public/${file}`,import.meta.url))));
  }
}
