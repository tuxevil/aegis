import fs from "node:fs";
import {reportDocumentedCorpus} from "../hazards/corpus.js";
const manifest=JSON.parse(fs.readFileSync(new URL("../replay/multihazard-corpus.v1.json",import.meta.url),"utf8"));
const reference=JSON.parse(fs.readFileSync(new URL("../replay/guayaquil-2026-10-26.json",import.meta.url),"utf8"));
const cuts=process.argv.slice(2);
try {console.log(JSON.stringify(reportDocumentedCorpus(manifest,reference,cuts.length?cuts:["2026-10-25T22:00:00Z","2026-10-25T23:30:00Z","2026-10-26T13:00:00Z","2026-10-26T19:00:00Z"]),null,2));}
catch {console.error("Replay refused: use canonical UTC cutoffs. No network or publication.");process.exitCode=1;}
