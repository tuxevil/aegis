// Optional local QA only. No real station, citizen, provider or WAHA connection.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {randomBytes,createHash} from "node:crypto";
import assert from "node:assert/strict";
import {createApp} from "../backend.js";
import {HistoryStore} from "../history.js";
import {RawArtifactStore} from "../hazards/artifact-store.js";
import {GridWeatherBridge} from "../hazards/grid-weather.js";
import {AlertJournal} from "../alerts/journal.js";
import {EditorialService} from "../alerts/editorial.js";
import {archiveEvidenceVerifier} from "../alerts/evidence.js";
import {DryRunOutbox} from "../alerts/outbox.js";
import {ZoneSubscriptions} from "../alerts/subscriptions.js";
const output=process.argv.find(a=>a.startsWith("--out="))?.slice(6);
if(!output)throw new Error("Use --out=/new/private/screenshot-directory");
await fs.mkdir(path.resolve(output),{mode:0o700});
const {chromium}=await import(process.env.AEGIS_PLAYWRIGHT_MODULE||"playwright");
const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-browser-fixtures-"));
const sourceStore=new RawArtifactStore(root,{origin:"synthetic_fixture"});
await new GridWeatherBridge({store:sourceStore}).capture({weather:{timestamp:new Date().toISOString(),rainRateMmHr:9,rainDailyMm:null}},{fixture:true});
const journal=new AlertJournal(root,{origin:"synthetic_fixture"}),verifyEvidence=archiveEvidenceVerifier(sourceStore);
const tokens={editor:randomBytes(32).toString("base64url"),approver:randomBytes(32).toString("base64url")};
const credentials=Object.entries(tokens).map(([role,token])=>({id:role,role,tokenSha256:createHash("sha256").update(token).digest("hex")}));
const app=await createApp({store:new HistoryStore(),mac:null,fetchUrl:async()=>({status:503,data:""}),hazardsEnabled:false,
  alertsAdminEnabled:true,alertsAdminCredentials:credentials,alertsAdminServices:{sourceStore,editorial:new EditorialService({journal,verifyEvidence}),outbox:new DryRunOutbox({journal,verifyEvidence})},
  zoneSubscriptionsEnabled:true,zoneSubscriptionService:new ZoneSubscriptions({journal:new AlertJournal(root,{kind:"subscriptions",origin:"synthetic_fixture"})})});
const address=await app.listen({host:"127.0.0.1",port:0});let browser;
try {
  browser=await chromium.launch({executablePath:process.env.AEGIS_CHROMIUM_EXECUTABLE||undefined,headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext(),errors=[];
  context.on("page",page=>page.on("pageerror",e=>errors.push(e.message)));
  await context.route("**/*",route=>new URL(route.request().url()).origin===address?route.continue():route.abort());
  const editor=await context.newPage(),approver=await context.newPage(),cities=await context.newPage();
  async function login(page,role) {await page.goto(address+"/editorial/");await page.fill("#credential",tokens[role]);await page.locator("#login button").click();await page.waitForFunction(()=>!document.querySelector("#private").hidden);assert.equal(await page.inputValue("#credential"),"");}
  async function fit(page) {assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  for(const width of [320,1280]) {
    for(const page of [editor,approver,cities])await page.setViewportSize({width,height:900});
    await login(editor,"editor");
    if(width===320) {
      await editor.selectOption("#area","pallatanga");await editor.locator("#candidate-form button").click();
      await editor.getByRole("button",{name:"Importar borrador para revisión"}).click();
      await editor.locator("#alerts textarea").fill("QA sintético: comprobar evidencia y alcance de estación.");
      await editor.getByRole("button",{name:"Solicitar revisión",exact:true}).click();await editor.waitForFunction(()=>document.querySelector("#status").textContent.includes("Transición registrada"));
      await login(approver,"approver");await approver.locator("#alerts textarea").fill("QA sintético: revisión independiente para simulación.");
      await approver.getByRole("button",{name:"Aprobar para simulación",exact:true}).click();await approver.waitForFunction(()=>document.querySelector("#status").textContent.includes("Transición registrada"));
      await approver.getByRole("button",{name:"Encolar simulación WAHA",exact:true}).click();
      await approver.getByRole("button",{name:"Procesar simulación",exact:true}).click();
      await approver.waitForFunction(()=>document.querySelector("#outbox").textContent.includes("simulated"));
    } else await login(approver,"approver");
    await fit(editor);await fit(approver);
    await approver.screenshot({path:path.join(output,`editorial-${width}.png`),fullPage:true});
    await editor.locator("#logout").click();assert.equal(await editor.locator("#alerts article").count(),0);
    await cities.goto(address+"/ciudades/");await cities.waitForFunction(()=>!document.querySelector("#save").disabled);
    await cities.getByLabel(/Pallatanga · Chimborazo/).check();await cities.locator("#consent").check();await cities.locator("#push-interest").check();
    await cities.locator("#save").click();await cities.waitForFunction(()=>!document.querySelector("#created").hidden);
    assert.equal(await cities.evaluate(()=>localStorage.length+sessionStorage.length),0);
    assert.equal(await cities.evaluate(()=>Notification.permission),"default");
    await cities.locator("#revoke").click();await cities.waitForFunction(()=>document.querySelector("#status").textContent.includes("dada de baja"));
    assert.equal(await cities.inputValue("#new-secret"),"");await fit(cities);
    await cities.screenshot({path:path.join(output,`cities-${width}.png`),fullPage:true});
    for(const [page,target] of [[editor,"workspace"],[cities,"main"]]) {
      await page.reload();await page.keyboard.press("Tab");assert.equal(await page.evaluate(()=>document.activeElement.className),"skip");
      await page.keyboard.press("Enter");assert.equal(await page.evaluate(()=>document.activeElement.id),target);
    }
  }
  assert.deepEqual(errors,[]);
  console.log("PASS: Chromium 320/1280px, independent editorial review and WAHA simulation, zone consent/revocation, keyboard/focus, no overflow/page errors; external requests blocked.");
} finally {await browser?.close();await app.close();await fs.rm(root,{recursive:true,force:true});}
