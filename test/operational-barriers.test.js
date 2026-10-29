import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import {createApp} from "../backend.js";
import {readFeatureFlags} from "../feature-flags.js";
import {readPushConfig} from "../push/policy.js";
import {createPushTransport,startPushWorker,dispatchPush} from "../push/transport.js";
import {SourceHttp} from "../hazards/http.js";

test("hostile delivery configuration cannot reach HTTPS, fetch, queue claims or background work",async t=>{
  let network=0,claims=0,simulations=0;
  t.mock.method(https,"request",()=>{network++;throw Error("Network forbidden in negative test");});
  t.mock.method(globalThis,"fetch",async()=>{network++;throw Error("Network forbidden in negative test");});
  const store={info:()=>({synthetic:false}),subscriptions:{claim(){claims++;throw Error("Must not claim");}}};
  const inputs=[null,undefined,{},[],{delivery:true},{delivery:"true"},{delivery:1},
    Object.create({delivery:true}),{get privateKey(){throw Error("Credential must not be read");}}];
  for(const input of inputs)assert.throws(()=>createPushTransport(input),/DRY_RUN/);
  for(const delivery of [true,"true",1,{},[]]) {
    await assert.rejects(dispatchPush(store,{delivery},{transport:async()=>{simulations++;return {status:201};}}),/DRY_RUN/);
    let stop;
    try {assert.throws(()=>{stop=startPushWorker(store,{delivery});},/DRY_RUN/);}
    finally {await stop?.();}
  }
  assert.equal(claims,0);assert.equal(network,0);assert.equal(simulations,0);
});

test("notification flags and inherited configuration never override real-delivery rejection",async t=>{
  let network=0,opened=0;
  t.mock.method(https,"request",()=>{network++;throw Error("Network forbidden");});
  t.mock.method(globalThis,"fetch",async()=>{network++;throw Error("Network forbidden");});
  const required={PUBLIC_API_V1:true,SQLITE_STORAGE:true,BLACKOUT_MAP:true,OFFICIAL_SCHEDULES:true,PUSH_ALERTS:true};
  // Exercise every subset of the other existing v5 flags with sending requested.
  const optional=["CITIZEN_REPORTS","TIME_MACHINE","EXPLORER_3D","OSINT_NEWS","OSINT_X","EVENT_CORRELATION"];
  for(let mask=0;mask<2**optional.length;mask++) {
    const flags={...required,...Object.fromEntries(optional.map((name,i)=>[name,Boolean(mask&(1<<i))]))};
    await assert.rejects(createApp({flags,pushConfig:{delivery:true},reportsOrigin:"https://example.invalid",
      openV5Store:async()=>{opened++;throw Error("Must not open persistent store");}}),/DRY_RUN/);
  }
  const inherited=readFeatureFlags(Object.create(required));
  assert.ok(Object.values(inherited).every(value=>value===false));
  assert.throws(()=>readPushConfig({PUSH_DELIVERY:"true"}),/DRY_RUN/);
  assert.equal(opened,0);assert.equal(network,0);
});

test("source transport rejects URL/host injection and does not follow redirect to private services",async()=>{
  let calls=0;
  const http=new SourceHttp({httpFetch:async(url,options)=>{
    calls++;assert.equal(new URL(url).hostname,"www.inamhi.gob.ec");
    assert.equal(options.method,"GET");assert.equal(options.redirect,"manual");
    return new Response(null,{status:302,headers:{location:"http://169.254.169.254/private-metadata"}});
  }});
  for(const [id,request] of [
    ["http://127.0.0.1/private",undefined],
    ["inamhi.warning.pdf",{url:"http://127.0.0.1/private"}],
    ["openmeteo.singlerun.ecmwf",{run:"2026-10-29T00:00",area:"http://169.254.169.254"}],
    ["openmeteo.singlerun.ecmwf",{run:"2026-10-29T00:00",area:"guayaquil",hostname:"127.0.0.1"}],
  ])await assert.rejects(http.get(id,request));
  assert.equal(calls,0);
  await assert.rejects(http.get("inamhi.warning.pdf"),/http_302/);assert.equal(calls,1);
});
