import fs from "node:fs";
import {HazardPublicReader} from "./public-reader.js";
import {hazardResponseSchema} from "./public-schemas.js";

export const hazardPaths=Object.freeze(["sources","areas","observations","bulletins","health"].map(s=>`/api/hazards/${s}`));
export async function registerHazardRoutes(app,{reader=new HazardPublicReader()}={}) {
  for(const route of hazardPaths) {
    const collection=route.split("/").at(-1);
    app.get(route,{config:{aegisPublicRead:true,rateLimit:{max:60,timeWindow:"1 minute"}},
      preValidation:async(req,reply)=>{
        if(Object.keys(req.query).some(k=>!["area","limit","offset"].includes(k))) return reply.code(400).send({error:"invalid_query"});
      },
      schema:{response:{200:hazardResponseSchema(collection)},querystring:{type:"object",additionalProperties:false,properties:{
        area:{type:"string",enum:["guayaquil","pallatanga","0901","0608"]},
        limit:{type:"integer",minimum:1,maximum:50,default:20},offset:{type:"integer",minimum:0,maximum:10000,default:0}}}}},
      async(req,reply)=>{
        reply.header("Cache-Control","public, max-age=30");
        try {return await reader.read(collection,req.query);}
        catch {return reply.code(503).header("Cache-Control","no-store").send({error:"hazard_sources_unavailable",coverageStatus:"unknown",alertsPublishEnabled:false,dispatchMode:"DRY_RUN"});}
      });
  }
  app.get("/hazards",(_,reply)=>reply.redirect("/hazards/"));
  for(const [route,file,type] of [["/hazards/","hazards.html","text/html"],["/hazards/app.js","hazards.js","text/javascript"],["/hazards/style.css","hazards.css","text/css"]]) {
    app.get(route,(_,reply)=>reply.type(type).header("Cache-Control","no-cache")
      .header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
      .send(fs.readFileSync(new URL(`../public/${file}`,import.meta.url))));
  }
}
