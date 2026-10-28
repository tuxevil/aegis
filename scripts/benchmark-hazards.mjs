// Fixed public synthetic corpus only. No network, credentials or active policy updates.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {runSyntheticBenchmark,compareBenchmarks} from '../hazards/benchmark.js';
export async function readBenchmarkJson(file) {
  if(!(await fs.stat(file)).isFile())throw new Error('invalid_benchmark_file');
  const handle=await fs.open(file,'r');
  try {if(!(await handle.stat()).isFile())throw new Error('invalid_benchmark_file');const chunks=[];let size=0;
    for await(const part of handle.createReadStream({autoClose:false})){size+=part.length;if(size>2000000)throw new Error('benchmark_file_budget');chunks.push(part);}
    return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
  } finally {await handle.close();}
}
export async function main(args=process.argv.slice(2)) {
  if(args.length>1||(args.length===1&&!/^--baseline=.+$/.test(args[0])))throw new Error('invalid_benchmark_arguments');
  const inputs=await readBenchmarkJson(new URL('../replay/benchmarks/synthetic-inputs.v1.json',import.meta.url));
  const labels=await readBenchmarkJson(new URL('../replay/benchmarks/synthetic-labels.v1.json',import.meta.url));
  const current=await runSyntheticBenchmark({inputs,labels});
  const output=args.length?{current,comparison:compareBenchmarks({baseline:await readBenchmarkJson(args[0].slice(11)),current,inputs,labels})}:current;
  console.log(JSON.stringify(output,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error('Synthetic benchmark refused: check fixed corpus or a compatible baseline report. No network or publication.');process.exitCode=1;});
