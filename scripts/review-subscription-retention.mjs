import {reviewSubscriptionRetention} from "../alerts/retention-review.js";
const args=process.argv.slice(2),allowed=["data-dir","as-of"];
if(!args.length)console.log("Private read-only retention review: --data-dir=LOCAL_DIR --as-of=UTC [--fixture]. No network, deletion or notifications.");
else {
  try {
    const options={};
    for(const arg of args) {
      if(arg==="--fixture") {if(options.fixture)throw new Error();options.fixture=true;continue;}
      const match=/^--([a-z-]+)=(.+)$/.exec(arg);
      if(!match||!allowed.includes(match[1])||Object.hasOwn(options,match[1]))throw new Error();
      options[match[1]]=match[2];
    }
    if(!options["data-dir"]||!options["as-of"])throw new Error();
    const report=await reviewSubscriptionRetention({dataDir:options["data-dir"],asOf:options["as-of"],
      origin:options.fixture?"synthetic_fixture":"captured_source"});
    console.log(JSON.stringify(report,null,2));
  }catch {console.error("Retention review refused: verify arguments, UTC cutoff and existing journal. No changes made.");process.exitCode=1;}
}
