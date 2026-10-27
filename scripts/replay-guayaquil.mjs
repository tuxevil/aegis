import { readFileSync } from "node:fs";
import { replayCase, planChannelOutbox } from "../replay/engine.js";
const path = new URL("../replay/guayaquil-2026-10-26.json", import.meta.url);
const data = JSON.parse(readFileSync(path,"utf8"));
const checkpoints = process.argv.slice(2);
const cuts = checkpoints.length ? checkpoints : [
  "2026-10-25T17:00:00-05:00",
  "2026-10-25T19:00:00-05:00",
  "2026-10-26T08:00:00-05:00",
  "2026-10-26T14:00:00-05:00"
];
for (const cutoff of cuts) {
  const result = replayCase(data,cutoff);
  console.log(JSON.stringify({
    evaluatedAt:cutoff,
    knownEvents:result.knownEvents.length,
    possiblePreventionMessages:result.drafts.filter(x=>x.leadMinutesToAfternoonRainWindow > 0).length,
    drafts:result.drafts,
    whatsappOutbox:planChannelOutbox(result)
  },null,2));
}
