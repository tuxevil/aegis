// Optional developer QA: app.inject bridges all browser traffic, no listening port.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import webPush from "web-push";
import {createApp} from "../backend.js";
import {HistoryStore} from "../history.js";
import {openStore} from "../storage/sqlite-store.js";
import {AlertJournal} from "../alerts/journal.js";
import {ZoneSubscriptions} from "../alerts/subscriptions.js";
const output=process.argv.find(a=>a.startsWith("--out="))?.slice(6);
if(!output)throw Error("Use --out=NEW_PRIVATE_QA_DIRECTORY");
await fs.mkdir(output,{mode:0o700});
const {chromium}=await import(process.env.AEGIS_PLAYWRIGHT_MODULE||"playwright");
const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-integrated-browser-"));
const now=()=>new Date(),key=randomBytes(32),vapid=webPush.generateVAPIDKeys();
const sqlite=await openStore({directory:":memory:",synthetic:true,now,pushStorageKey:key});
let app,browser;
try {
  sqlite.writeBatch(JSON.parse(await fs.readFile(new URL("../demo/blackout.json",import.meta.url),"utf8")));
  app=await createApp({store:new HistoryStore(root),mac:null,now,fetchUrl:async()=>{throw Error("offline QA");},
    flags:{PUBLIC_API_V1:true,SQLITE_STORAGE:true,BLACKOUT_MAP:true,CITIZEN_REPORTS:true,OFFICIAL_SCHEDULES:true,PUSH_ALERTS:true,TIME_MACHINE:true,EXPLORER_3D:true},
    openV5Store:async()=>sqlite,reportsOrigin:"https://example.invalid",
    pushConfig:{origin:"https://example.invalid",storageKey:key,publicKey:vapid.publicKey,privateKey:vapid.privateKey,delivery:false},
    hazardsEnabled:true,zoneSubscriptionsEnabled:true,
    zoneSubscriptionService:new ZoneSubscriptions({journal:new AlertJournal(root,{origin:"synthetic_fixture",kind:"subscriptions"})})});
  browser=await chromium.launch({headless:true,executablePath:process.env.AEGIS_CHROMIUM_PATH||undefined,args:["--no-sandbox","--disable-gpu"]});
  const results=[];
  for(const width of [320,1280]) {
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:"block"}),page=await context.newPage(),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await context.route("**/*",async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!=="https://example.invalid")return route.abort();
      const response=await app.inject({method:request.method(),url:url.pathname+url.search,
        headers:{...request.headers(),host:"example.invalid"},...(request.postData()?{payload:request.postData()}:{}),remoteAddress:"198.51.100.30"});
      const headers={...response.headers};delete headers["content-length"];delete headers["transfer-encoding"];
      await route.fulfill({status:response.statusCode,headers,body:response.rawPayload});
    });
    for(const [name,url] of Object.entries({grid:"/ui",map:"/map",report:"/report",watch:"/watch/",history:"/history/",explorer:"/explorer/",hazards:"/hazards/",cities:"/ciudades/"})) {
      const response=await page.goto("https://example.invalid"+url,{waitUntil:"networkidle"});assert.equal(response.status(),200,url);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${name} overflow at ${width}`);
      if(name==="grid"&&width===320) {
        const railClipped=await page.locator(".rail").evaluate(el=>el.scrollWidth>el.clientWidth+1);
        assert.equal(railClipped,false,"Grid navigation must not be clipped by experimental links");
      }
      await page.screenshot({path:path.join(output,`${name}-${width}.png`),fullPage:true});
      if(name==="watch")assert.equal(await page.locator("#enable-push").isDisabled(),true);
      results.push({page:name,width,status:response.status(),horizontalOverflow:overflow});
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  await fs.writeFile(path.join(output,"receipt.json"),JSON.stringify({results,externalNetwork:"blocked",listeningPorts:0,
    fixtures:"synthetic_only",realPush:"blocked",pageErrors:0},null,2));
  console.log(JSON.stringify({pages:results.length,pageErrors:0,horizontalOverflow:0,externalNetwork:"blocked",listeningPorts:0}));
}finally {await browser?.close();await app?.close();if(!app)sqlite.close();await fs.rm(root,{recursive:true,force:true});}
