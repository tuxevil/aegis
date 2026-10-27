import fs from "node:fs";
import {cityChannels,nationalDiscoveryChannel} from "./channels.js";
import {safeMode} from "../hazards/registry.js";
import {zoneConsentVersion} from "./subscriptions.js";
const closed=properties=>({type:"object",additionalProperties:false,properties});
const preferences={areaIds:{type:"array",minItems:1,maxItems:5,uniqueItems:true,items:{type:"string",minLength:1,maxLength:60}},consent:{const:true},consentVersion:{const:zoneConsentVersion},pushInterest:{type:"boolean"}};
const required=Object.keys(preferences);
export async function registerSubscriptionRoutes(app,{service}) {
  if(!service)throw new Error("subscription_service_required");
  await app.register(async scope=>{
    scope.setErrorHandler((error,req,reply)=>{
      if(error.statusCode===429)return reply.code(429).send({error:"subscription_rate_limited"});
      if(error.validation||error.statusCode===400||error.statusCode===413)return reply.code(error.statusCode===413?413:400).send({error:"invalid_subscription_request"});
      if(error.message==="subscription_authentication_required")return reply.code(401).header("WWW-Authenticate","Bearer").send({error:"subscription_authentication_required"});
      if(error.message==="subscription_challenge_used")return reply.code(409).send({error:"subscription_challenge_used"});
      if(/^invalid_subscription_(challenge|preferences)$/.test(error.message))return reply.code(400).send({error:"invalid_subscription_request"});
      return reply.code(503).send({error:"subscription_store_unavailable"});
    });
    const route=(method,url,body,handler,{authenticate=false,max=10}={})=>scope.route({method,url,exposeHeadRoute:false,bodyLimit:4096,
      config:{aegisSubscriptions:true,rateLimit:false},schema:{querystring:closed({}),...(body?{body}:{} )},
      onRequest:[async(req,reply)=>{reply.header("Cache-Control","no-store").header("Referrer-Policy","no-referrer").header("X-Content-Type-Options","nosniff");},
        scope.rateLimit({max,timeWindow:"1 minute",allowList:[]}),async(req,reply)=>{
          if(authenticate) {
            const h=req.headers.authorization;
            if(typeof h!=="string"||!/^Bearer [A-Za-z0-9_-]{43}$/.test(h))return reply.code(401).header("WWW-Authenticate","Bearer").send({error:"subscription_authentication_required"});
            req.zoneSecret=h.slice(7);
          }
        }],
      preValidation:async(req,reply)=>{
        if(Object.keys(req.query).length||(!body&&req.body!==undefined)||(body&&(!req.body||typeof req.body!=="object"||Array.isArray(req.body)||Object.keys(req.body).some(k=>!Object.hasOwn(body.properties,k)))))return reply.code(400).send({error:"invalid_subscription_request"});
      },handler});
    route("GET","/api/subscriptions/catalog",null,()=>({areas:service.catalog.map(a=>({id:a.id,dpaCode:a.dpaCode,name:a.name,province:a.province,
      codeStatus:a.codeStatus??"pending_revalidation",codeSource:a.codeSource??null,precision:"canton",boundaryVersion:a.boundaryVersion??null,coverageStatus:"limited"})),
      catalogVersion:"pilot-dpa-v1-pending-revalidation",catalogScope:"pilot_cantons_only_not_national_catalog",channels:cityChannels(),nationalChannel:nationalDiscoveryChannel(),consentVersion:zoneConsentVersion,
      pushAvailable:false,notice:"El registro guarda una preferencia, no activa avisos ni confirma seguimiento en WhatsApp.",...safeMode}),{max:60});
    route("GET","/api/subscriptions/challenge",null,req=>service.challenge(req.ip),{max:5});
    route("POST","/api/subscriptions/zones",{...closed({...preferences,challenge:{type:"string",maxLength:150},website:{type:"string",maxLength:0}}),required:[...required,"challenge"]},req=>{
      const {challenge,website,...prefs}=req.body;return service.create(prefs,{challenge,website,clientAddress:req.ip});
    },{max:5});
    route("GET","/api/subscriptions/zones/me",null,req=>service.read(req.zoneSecret),{authenticate:true,max:20});
    route("PATCH","/api/subscriptions/zones/me",{...closed(preferences),required},req=>service.update(req.zoneSecret,req.body),{authenticate:true,max:10});
    route("DELETE","/api/subscriptions/zones/me",null,req=>service.revoke(req.zoneSecret),{authenticate:true,max:10});
  });
  app.get("/ciudades",(_,reply)=>reply.redirect("/ciudades/"));
  for(const [url,file,type] of [["/ciudades/","cities.html","text/html"],["/ciudades/app.js","cities.js","text/javascript"],["/ciudades/style.css","cities.css","text/css"]]) {
    app.get(url,(_,reply)=>reply.type(type).header("Cache-Control","no-store").header("Referrer-Policy","no-referrer")
      .header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
      .send(fs.readFileSync(new URL(`../public/${file}`,import.meta.url))));
  }
}
