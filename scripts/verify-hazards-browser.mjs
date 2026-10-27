// Optional QA dependency: Playwright is deliberately not part of production.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {createApp} from "../backend.js";
import {HistoryStore} from "../history.js";
import {HazardPublicReader} from "../hazards/public-reader.js";
const output=process.argv.find(a=>a.startsWith("--out="))?.slice(6);
if(!output) throw new Error("Use --out=/new/private/screenshot-directory");
await fs.mkdir(path.resolve(output),{mode:0o700});
const {chromium}=await import(process.env.AEGIS_PLAYWRIGHT_MODULE||"playwright");
const app=await createApp({hazardsEnabled:true,hazardReader:new HazardPublicReader(),store:new HistoryStore(),mac:null,fetchUrl:async()=>({status:503,data:""})});
const address=await app.listen({host:"127.0.0.1",port:0});
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.AEGIS_CHROMIUM_EXECUTABLE||undefined,headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
  for(const width of [320,1280]) {
    await page.setViewportSize({width,height:900});await page.goto(address+"/hazards/");
    await page.waitForFunction(()=>document.querySelector("#status").textContent.includes("Consulta completada"));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator("#sources li").count(),4);
    await page.selectOption("#area","pallatanga");
    await page.waitForFunction(()=>document.querySelector("#coverage").textContent.includes("Pallatanga"));
    await page.screenshot({path:path.join(output,`hazards-${width}.png`),fullPage:true});
    await page.reload();await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(()=>document.activeElement.className),"skip");
    await page.keyboard.press("Enter");assert.equal(await page.evaluate(()=>document.activeElement.id),"content");
  }
  assert.deepEqual(errors,[]);
  console.log("PASS: Chromium 320/1280px; no overflow; pilot selection; keyboard; no page errors. External requests blocked.");
} finally {await browser?.close();await app.close();}
