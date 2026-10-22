import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "../storage/sqlite-store.js";
import { MIGRATIONS } from "../storage/migrations.js";
import { restoreSnapshot } from "../storage/backups.js";
import { canonicalUrl } from "../storage/correlation-rules.js";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
import { readFeatureFlags } from "../feature-flags.js";
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/storage-v1.json",import.meta.url)));
const cases = JSON.parse(fs.readFileSync(new URL("./fixtures/correlation-cases.json",import.meta.url)));
const hash = text => createHash("sha256").update(text).digest("hex");
const base = Date.parse("2026-10-21T12:00:00Z");
const at = minute => new Date(base+minute*60000).toISOString();
const now = () => new Date(at(180));
function temporary(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(),"aegis-correlation-")); t.after(() => fs.rmSync(directory,{recursive:true,force:true})); return directory; }
async function setup(t, options = {}) {
  const store = await openStore({directory:":memory:",synthetic:true,now,...options});
  t.after(() => store.close());
  store.writeBatch({areas:[
    {...fixture.areas[0],id:"canton",type:"canton",location_precision:"administrative_area"},
    ...["sector-a","sector-b"].map(id => ({...fixture.areas[0],id,parent_id:"canton"})),
    {...fixture.areas[0],id:"elsewhere",type:"canton",location_precision:"administrative_area"},
  ]});
  function add(spec = {}) {
    const {id,minute=0,area="sector-a",confidence="exact",kind="news",signal="outage"} = spec;
    const source = spec.source ?? `s_${id}`, artifact = `a_${id}`;
    if (!store.repositories.sources.get(source)) store.writeBatch({sources:[{...fixture.sources[0],id:source,kind,official:kind==="authority",access_policy:spec.access_policy ?? "public",enabled:spec.enabled ?? true}]});
    store.writeBatch({artifacts:[{...fixture.artifacts[0],id:artifact,source_id:source,sha256:hash(spec.hash ?? id),source_url:spec.url ?? `https://example.invalid/${id}`,extraction_status:spec.extraction_status ?? "parsed"}],
      observations:[{...fixture.observations[0],id,source_id:source,artifact_id:artifact,area_id:area,dedupe_key:id,kind:spec.observation_kind ?? "power_outage",summary:spec.summary ?? `Declaración independiente ${id}`,
        occurred_at:spec.noTime ? null : at(minute),observed_at:null,reported_start_at:null,ingested_at:at(120+(spec.ingest ?? 0)),temporal_confidence:confidence,moderation_state:spec.moderation ?? "approved"}]});
    return {observation_id:id,type:spec.type ?? "unplanned",signal,origin_key:spec.origin ?? `origin:${source}`,origin_reviewed:spec.reviewed ?? true,
      canonical_url:spec.canonical_url ?? null,review_reason:"Fixture sintético; procedencia y zona revisadas",
      ...(spec.event_id ? {event_id:spec.event_id}:{}),...(spec.replaces ? {replaces:spec.replaces}:{}),...(spec.competence ? {competence:spec.competence}:{})};
  }
  const submit = spec => store.correlation.submit(add(spec));
  return {store,add,submit};
}

test("correlation remains OFF; approved observations, events and provenance remain distinct", async t => {
  const {store,submit} = await setup(t);
  assert.equal(readFeatureFlags({}).EVENT_CORRELATION,false);
  const result = submit({id:"first"});
  assert.equal(result.event.status,"reported");
  assert.equal(result.facts.independent_origins,1);
  assert.equal(store.repositories.sources.list().length,1);
  assert.equal(store.repositories.observations.list().length,1);
  assert.equal(store.repositories.events.list().length,1);
  assert.equal(store.publicReader.getEvent(result.event.id).status,"reported");
  assert.equal(store.correlation.revisions(result.event.id)[0].snapshot.event.status,"reported");
});

test("contradictory fixtures downgrade corroborated without fabricating an end; replay is idempotent", async t => {
  const {store,add} = await setup(t);
  const one = store.correlation.submit(add(cases.contradictory[0]));
  const input = add(cases.contradictory[1]), two = store.correlation.submit(input);
  assert.equal(two.event.id,one.event.id); assert.equal(two.event.status,"corroborated");
  assert.deepEqual(store.correlation.submit(input),two);
  assert.throws(() => store.correlation.submit({...input,origin_key:"changed"}),/contenido distinto/);
  const denial = store.correlation.submit({...add(cases.contradictory[2]),event_id:one.event.id});
  assert.equal(denial.event.status,"unknown"); assert.equal(denial.event.end_at,null);
  assert.deepEqual(store.correlation.revisions(one.event.id).map(r=>r.snapshot.event.status),["reported","corroborated","unknown"]);
  assert.equal(store.publicReader.listEvidence(one.event.id).at(-1).relation,"refute");
});

test("imprecise/missing times remain separate and do not acquire ingestion time as event start", async t => {
  const {submit,store,add} = await setup(t);
  const a=submit(cases.imprecise[0]), b=submit(cases.imprecise[1]), c=submit({id:"missing",noTime:true});
  assert.notEqual(a.event.id,b.event.id); assert.notEqual(b.event.id,c.event.id);
  for(const item of [a,b,c]) { assert.equal(item.event.start_at,null); assert.equal(item.event.status,"reported"); assert.equal(item.facts.independent_origins,0); }
  const precise=submit({id:"precise"});
  assert.throws(()=>store.correlation.submit({...add({id:"ambiguous",confidence:"approximate"}),event_id:precise.event.id}),/impreciso/);
  assert.equal(store.repositories.evidence.list().length,4);
});

test("neighboring sectors, incompatible types and fixed windows never merge; ambiguity is quarantined", async t => {
  const {submit,store,add}=await setup(t);
  const a=submit(cases.neighboring[0]), b=submit(cases.neighboring[1]);
  assert.notEqual(a.event.id,b.event.id);
  assert.notEqual(submit({id:"scheduled",type:"scheduled"}).event.id,a.event.id);
  assert.equal(submit({id:"edge",minute:60}).event.id,a.event.id);
  const later=submit({id:"later",minute:61}); assert.notEqual(later.event.id,a.event.id);
  const ambiguous=submit({id:"ambiguous-match",minute:30}); assert.notEqual(ambiguous.event.id,a.event.id); assert.notEqual(ambiguous.event.id,later.event.id);
  assert.match(store.correlation.revisions(ambiguous.event.id)[0].reason,/múltiples/);
  assert.throws(()=>store.correlation.submit({...add({id:"wrong-area",area:"sector-b"}),event_id:a.event.id}),/Zonas incompatibles/);
  assert.throws(()=>store.correlation.submit({...add({id:"wrong-type",type:"scheduled"}),event_id:a.event.id}),/Tipos o señales/);
});

test("reposts, hashes, copied summaries, shared owners and transitive duplicates never add independent origins", async t => {
  const {submit}=await setup(t);
  const a=submit(cases.duplicates[0]),b=submit(cases.duplicates[1]),c=submit(cases.duplicates[2]);
  assert.equal(b.facts.independent_origins,1);assert.equal(c.facts.independent_origins,1);assert.equal(c.event.status,"reported");
  const d=submit({id:"owner-copy",origin:"origin:s_original"});assert.equal(d.facts.independent_origins,1);
  const e=submit({id:"text-copy",summary:"Declaración independiente original"});assert.equal(e.facts.independent_origins,1);
  const f=submit({id:"real-independent"});assert.equal(f.event.id,a.event.id);assert.equal(f.event.status,"corroborated");
  const g=submit({id:"unverified",reviewed:false});assert.equal(g.facts.independent_origins,2);
  assert.equal(canonicalUrl("https://EXAMPLE.invalid/article/?b=2&utm_medium=x&a=1#top"),"https://example.invalid/article?a=1&b=2");
  assert.notEqual(canonicalUrl("https://example.invalid/?id=1"),canonicalUrl("https://example.invalid/?id=2"));
  assert.throws(()=>canonicalUrl("https://secret@example.invalid/"));
});

test("authority label alone is not official; document competence, scope and period must apply", async t => {
  const {submit}=await setup(t);
  const a=submit({id:"authority-label",kind:"authority"});assert.equal(a.event.status,"reported");
  const b=submit({id:"wrong-jurisdiction",kind:"authority",competence:{area_id:"elsewhere",from:at(-10),to:at(60)}}); assert.notEqual(b.event.status,"official");
  const c=submit({id:"expired",kind:"authority",competence:{area_id:"canton",from:at(-60),to:at(0)}});assert.notEqual(c.event.status,"official");
  const d=submit({id:"unparsed",kind:"authority",extraction_status:"review",competence:{area_id:"canton",from:at(-10),to:at(60)}});assert.notEqual(d.event.status,"official");
  const e=submit({id:"competent",kind:"authority",competence:{area_id:"canton",from:at(0),to:at(60)}});assert.equal(e.event.status,"official");
  assert.equal(e.event.start_at,at(0));assert.equal(e.event.end_at,null);
});

test("partial restoration never closes a canton; full restoration requires explicit competent evidence", async t => {
  const {submit}=await setup(t);
  const a=submit(cases.partial[0]);
  const partial=submit({...cases.partial[1],event_id:a.event.id,kind:"authority",competence:{area_id:"sector-a",from:at(0),to:at(60)}});
  assert.equal(partial.event.status,"unknown"); assert.equal(partial.event.end_at,null);assert.equal(partial.facts.partial_restorations,1);
  const full=submit({id:"full-restore",area:"canton",signal:"restored",minute:45,event_id:a.event.id,kind:"authority",competence:{area_id:"canton",from:at(0),to:at(60)}});
  assert.equal(full.event.status,"ended"); assert.equal(full.event.end_at,at(45));assert.equal(full.event.end_basis,"official");
});

test("one restoration, silence, ambiguous time and older restoration do not assert a full end", async t => {
  const {submit,store}=await setup(t);
  const a=submit({id:"outage"});
  assert.equal(store.correlation.recalculate(a.event.id).event.status,"reported");
  assert.equal(submit({id:"older",minute:-5,signal:"restored",event_id:a.event.id}).event.end_at,null);
  assert.equal(submit({id:"uncertain",minute:30,confidence:"approximate",signal:"restored",event_id:a.event.id}).event.end_at,null);
  const b=submit({id:"restored-1",minute:30,signal:"restored",event_id:a.event.id});assert.equal(b.event.status,"unknown");
  const c=submit({id:"restored-2",minute:35,signal:"restored",event_id:a.event.id});assert.equal(c.event.status,"ended");assert.equal(c.event.end_at,at(35));
  const after=submit({id:"renewed",minute:40,event_id:a.event.id});assert.equal(after.event.end_at,null);assert.equal(after.event.status,"unknown");
});

test("retraction/correction preserves original observations, links and immutable revisions", async t => {
  const directory=temporary(t), {submit,store,add}=await setup(t,{directory});
  const a=submit({id:"one"});submit({id:"two"});
  const input=add({id:"withdraw-two",signal:"retraction",replaces:"two"});
  const result=store.correlation.submit(input);
  assert.equal(result.event.status,"reported");assert.deepEqual(result.facts.retracted_observations,["two"]);
  assert.deepEqual(store.correlation.submit(input),result);
  assert.equal(store.repositories.observations.get("two").summary,"Declaración independiente two");
  assert.equal(store.publicReader.listEvidence(a.event.id).length,3);
  assert.equal(store.correlation.revisions(a.event.id).length,3);
  assert.equal(store.correlation.decisions(a.event.id).find(c=>c.observation_id==="withdraw-two").decision.replaces,"two");
  assert.throws(()=>store.correlation.submit(add({id:"again",signal:"retraction",replaces:"two"})),/predecesor activo/);
  const db=new DatabaseSync(path.join(directory,"aegis-v5.sqlite"));t.after(()=>db.close());
  assert.throws(()=>db.exec("UPDATE correlation_claims SET signal='outage'"),/immutable/);
  assert.throws(()=>db.exec("DELETE FROM correlation_revisions"),/immutable/);
  const corrected=submit({id:"corrected-time",minute:10,replaces:"one",origin:"origin:s_one"});
  assert.equal(corrected.event.start_at,at(10));assert.equal(store.correlation.revisions(a.event.id)[0].snapshot.event.start_at,at(0));
});

test("pending/private/disabled/citizen observations are not published through correlation; invalid inputs are atomic", async t => {
  const {store,add,submit}=await setup(t);
  for(const spec of [{id:"pending",moderation:"pending"},{id:"private",access_policy:"private"},{id:"disabled",enabled:false},{id:"citizen",kind:"citizen"}]) {
    assert.throws(()=>store.correlation.submit(add(spec)),/publicable|agregación/);
  }
  const a=submit({id:"public"});
  const bad=add({id:"bad-scope",competence:{area_id:"missing",from:at(0),to:at(60)}});
  assert.throws(()=>store.correlation.submit(bad),/competencia/);
  assert.equal(store.correlation.revisions(a.event.id).length,1);assert.equal(store.repositories.evidence.list().length,1);
  for(const patch of [{origin_reviewed:null},{canonical_url:["https://example.invalid"]},{origin_reviewed:"true"},{origin_key:"bad key"},{unexpected:true},{canonical_url:"http://example.invalid"},{type:"drop table"},{review_reason:""}]) {
    assert.throws(()=>store.correlation.submit({...bad,...patch}));
  }
  assert.throws(()=>store.correlation.revisions(a.event.id,101));
  assert.throws(()=>store.correlation.submit(add({id:"unbound-restore",signal:"restored"})),/explícito/);
});

test("migration v2→v3 snapshots preserve existing history and rollback into a new directory", async t => {
  const directory=temporary(t), old=await openStore({directory,synthetic:true,migrations:MIGRATIONS.slice(0,2),now});
  old.writeBatch(fixture);old.close();
  const {store,submit}=await setup(t,{directory});const result=submit({id:"migrated"});
  const backup=await store.backup();const dest=path.join(temporary(t),"restored");await restoreSnapshot(backup,dest);
  const restored=await openStore({directory:dest,synthetic:true,now});t.after(()=>restored.close());
  assert.deepEqual(restored.correlation.revisions(result.event.id),store.correlation.revisions(result.event.id));
  const prior=fs.readdirSync(path.join(directory,"backups")).find(f=>f.includes("pre-migration"));assert.ok(prior);
  const rollback=path.join(temporary(t),"v2");await restoreSnapshot(path.join(directory,"backups",prior),rollback);
  const original=await openStore({directory:rollback,synthetic:true,migrations:MIGRATIONS.slice(0,2)});t.after(()=>original.close());
  assert.equal(original.repositories.events.get("demo-event").status,"reported");assert.equal(original.info().version,2);
});

test("operator CLI requires explicit flag, existing current schema, and records only local audit", async t => {
  const directory=temporary(t), {store,add}=await setup(t,{directory});
  const input=add({id:"cli-observation"});
  const run=(args,env={},body)=>execFileSync(process.execPath,["scripts/correlation.js",...args],{cwd:process.cwd(),env:{...process.env,DB_DIR:directory,SQLITE_DEMO:"true",EVENT_CORRELATION:"false",...env},input:body,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
  assert.throws(()=>run(["submit"],{},JSON.stringify(input)),/EVENT_CORRELATION/);
  const result=JSON.parse(run(["submit"],{EVENT_CORRELATION:"true"},JSON.stringify(input)));
  assert.equal(result.event.status,"reported");assert.equal(JSON.parse(run(["history",result.event.id])).length,1);
  assert.throws(()=>run(["submit"],{EVENT_CORRELATION:"true"}," ".repeat(16385)),/16 KiB/);
  assert.equal(store.correlation.revisions(result.event.id).length,1);
});

test("public HTTP consumers see the revised status/provenance; no correlation mutation or private audit route", async t => {
  const {store,submit}=await setup(t);
  const a=submit({id:"http-one"});submit({id:"http-two"});
  const app=await createApp({store:new HistoryStore(),now,fetchUrl:async()=>{throw new Error("no network");},
    flags:{PUBLIC_API_V1:true,BLACKOUT_MAP:true,SQLITE_STORAGE:true,EVENT_CORRELATION:true},openV5Store:async()=>store});
  t.after(()=>app.close());
  let response=await app.inject({url:`/api/v1/events/${a.event.id}`,remoteAddress:"198.51.100.9"});
  assert.equal(response.statusCode,200);assert.equal(response.json().data.status,"corroborated");
  submit({id:"http-retract",signal:"retraction",replaces:"http-two"});
  response=await app.inject({url:`/api/v1/events/${a.event.id}`,remoteAddress:"198.51.100.9"});
  assert.equal(response.json().data.status,"reported");
  response=await app.inject({url:`/api/v1/events/${a.event.id}/evidence`,remoteAddress:"198.51.100.9"});
  assert.equal(response.statusCode,200);assert.ok(response.json().data.some(e=>e.relation==="retraction"));
  assert.ok(!response.body.includes("input_json"));assert.ok(!response.body.includes("origin_key"));
  for(const url of ["/api/v1/correlation","/api/v1/correlation/history"]) {
    response=await app.inject({method:"POST",url,payload:{},remoteAddress:"198.51.100.9"});assert.equal(response.statusCode,403);
  }
});

test("semantic issue categories stay separate; source duplication and missing documents cannot manufacture official evidence", async t => {
  const {submit,store,add}=await setup(t);
  const a=submit({id:"ordinary-outage"});
  const other=submit({id:"voltage",observation_kind:"voltage_dip"});assert.notEqual(a.event.id,other.event.id);
  assert.throws(()=>store.correlation.submit({...add({id:"wrong-semantic",observation_kind:"voltage_dip"}),event_id:a.event.id}),/semánticas/);
  const same=submit({id:"same-source",source:"s_ordinary-outage",origin:"different-attestation"});assert.equal(same.facts.independent_origins,1);
  const input=add({id:"no-document",kind:"authority",competence:{area_id:"canton",from:at(-1),to:at(60)}});
  // A reviewed source flag without an artifact never establishes an official document.
  const o=store.repositories.observations.get(input.observation_id);
  store.writeBatch({observations:[{...o,id:"no-artifact",dedupe_key:"no-artifact",artifact_id:null}]});
  const r=store.correlation.submit({...input,observation_id:"no-artifact"});assert.notEqual(r.event.status,"official");
});

test("official scope covers the event's exact evidence interval, not only a single point in it", async t => {
  const {submit}=await setup(t);
  const a=submit({id:"scope-official",kind:"authority",competence:{area_id:"canton",from:at(0),to:at(10)}});
  assert.equal(a.event.status,"official");
  const later=submit({id:"outside-validity",minute:15});assert.equal(later.event.id,a.event.id);assert.notEqual(later.event.status,"official");
});

test("bounded event size rejects the next claim atomically without truncating existing evidence", async t => {
  const {submit,store,add}=await setup(t);
  let last;
  for(let index=0;index<500;index++) last=submit({id:`bounded-${String(index).padStart(3,"0")}`,source:"bounded-source",origin:"bounded-owner"});
  assert.equal(last.facts.active_supports,500);assert.equal(last.facts.independent_origins,1);
  const extra=add({id:"bounded-overflow",source:"bounded-source",origin:"bounded-owner"});
  assert.throws(()=>store.correlation.submit(extra),/500 evidencias/);
  assert.equal(store.correlation.revisions(last.event.id,100,400).length,100);
  assert.equal(store.correlation.revisions(last.event.id,1,500).length,0);
  assert.equal(store.repositories.evidence.list({limit:500}).length,500);
  const held=store.correlation.hold(last.event.id,"Saturated event under manual review");
  assert.equal(held.event.status,"unknown");assert.equal(held.event.end_at,null);assert.equal(held.facts.review_hold,true);
  assert.equal(store.correlation.recalculate(last.event.id).event.status,"unknown");
  assert.equal(store.publicReader.getEvent(last.event.id).status,"unknown");
  assert.equal(store.correlation.revisions(last.event.id,1,500)[0].snapshot.facts.review_hold,true);
});

test("live pre-engine elevated claims are downgraded at publication without rewriting stored history", async t => {
  const store=await openStore({directory:":memory:",synthetic:false,now});t.after(()=>store.close());
  const batch=structuredClone(fixture);
  for(const rows of Object.values(batch)) for(const row of rows) row.synthetic=false;
  batch.sources[0]={...batch.sources[0],kind:"authority",official:true,access_policy:"public"};
  batch.observations[0].moderation_state="approved";batch.observations[0].temporal_confidence="exact";batch.evidence[0].human_reviewed=true;batch.events[0].status="official";
  store.writeBatch(batch);
  const published=store.publicReader.getEvent("demo-event");
  assert.equal(published.status,"unknown");assert.equal(published.end_at,null);assert.equal(published.start_basis,"unknown");
  assert.equal(store.repositories.events.get("demo-event").status,"official");
  const reviewed=store.correlation.submit({observation_id:"demo-observation",type:"unplanned",signal:"outage",origin_key:"fixture-authority",origin_reviewed:true,
    competence:{area_id:"demo-area",from:"2026-10-22T00:00:00Z",to:"2026-10-23T00:00:00Z"},review_reason:"Fixture local de documento competente"});
  assert.equal(store.publicReader.getEvent(reviewed.event.id).status,"official");
});

test("non-public replacements stop suppressing their predecessor while retaining audit history", async t => {
  const directory=temporary(t), {store,submit}=await setup(t,{directory});
  const first=submit({id:"review-base-one"});submit({id:"review-base-two"});
  submit({id:"review-withdrawal",signal:"retraction",replaces:"review-base-two"});
  const db=new DatabaseSync(path.join(directory,"aegis-v5.sqlite"));t.after(()=>db.close());
  for(const state of ["withdrawn","rejected"]) {
    db.prepare("UPDATE observations SET moderation_state=? WHERE id='review-withdrawal'").run(state);
    const result=store.correlation.recalculate(first.event.id);
    assert.equal(result.event.status,"corroborated");assert.deepEqual(result.facts.retracted_observations,[]);
  }
  db.exec("UPDATE observations SET moderation_state='approved' WHERE id='review-withdrawal'; UPDATE sources SET enabled=0 WHERE id='s_review-withdrawal'");
  assert.equal(store.correlation.recalculate(first.event.id).event.status,"corroborated");
  assert.equal(store.correlation.decisions(first.event.id).length,3);
});
