import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { replayCase, planChannelOutbox } from "./engine.js";

const data = JSON.parse(readFileSync(new URL("./guayaquil-2026-10-26.json", import.meta.url), "utf8"));

test("no puede usar datos publicados después del corte", () => {
  const run = replayCase(data, "2026-10-25T17:00:00-05:00");
  assert.equal(run.drafts.length, 0);
  assert.equal(run.knownEvents.length, 0);
});
test("aviso previo ciudad, sin datos conocidos retrospectivamente", () => {
  const run = replayCase(data, "2026-10-25T19:00:00-05:00");
  assert.equal(run.drafts.length, 1);
  assert.equal(run.drafts[0].kind, "warning");
  assert.equal(run.drafts[0].leadMinutesToAfternoonRainWindow, 1139);
  assert.doesNotMatch(run.drafts[0].message, /95[.,]3|148[.,]5|67[.,]3/);
});
test("reporte matutino no es predicción anterior a TODAS las inundaciones", () => {
  const run = replayCase(data, "2026-10-26T08:00:00-05:00");
  assert.equal(run.drafts.length, 2);
  assert.equal(run.drafts[1].leadMinutesToAfternoonRainWindow, 332);
});
test("eventos posteriores al corte siguen invisibles", () => {
  const run = replayCase(data, "2026-10-26T14:00:00-05:00");
  assert.equal(run.drafts.length, 2);
  assert.equal(run.knownEvents.length, 2);
});
test("el despacho nunca envía por WhatsApp y exige pertenencia verificada", () => {
  const run = replayCase(data, "2026-10-25T19:00:00-05:00");
  const noChannel = planChannelOutbox(run);
  assert.equal(noChannel[0].channelReady, false);
  assert.equal(noChannel[0].dispatchMode, "DRY_RUN");
  const withChannel = planChannelOutbox(run, {guayaquil:{id:"123456@newsletter",verifiedOwner:true}});
  assert.equal(withChannel[0].channelReady,true);
  assert.equal(withChannel[0].dispatchMode, "DRY_RUN");
  assert.equal(withChannel[0].idempotencyKey,"guayaquil-2026-10-26:inamhi-83-prensa-2510:whatsapp-channel");
});
test("fechas inválidas se rechazan", () => {
  assert.throws(() => replayCase(data, "no es fecha"), /Timestamp/);
});
