import {createStagingBackup,verifyStagingBackup,restoreStagingBackup} from "../staging-backup.js";
const args=process.argv.slice(2);
if(!args.length)console.log(JSON.stringify({status:"no_action",network:false,usage:[
  "--backup --from=STAGING_DATA --to=NEW_SNAPSHOT --quiesced",
  "--verify --snapshot=SNAPSHOT","--restore --snapshot=SNAPSHOT --to=NEW_DATA_ROOT"]}));
else {
  try {
    const modes=args.filter(a=>["--backup","--verify","--restore"].includes(a));
    if(modes.length!==1||new Set(args.map(a=>a.split("=")[0])).size!==args.length||args.some(a=>!/^--(?:backup|verify|restore|quiesced)$/.test(a)&&!/^--(?:from|to|snapshot)=.+$/.test(a)))throw Error("staging_invalid_arguments");
    const value=key=>args.find(a=>a.startsWith(key+"="))?.slice(key.length+1),mode=modes[0];let result;
    if(mode==="--backup") {
      if(!value("--from")||!value("--to")||value("--snapshot"))throw Error("staging_invalid_arguments");
      result=await createStagingBackup({sourceDir:value("--from"),snapshotDir:value("--to"),quiesced:args.includes("--quiesced")});
    } else {
      if(!value("--snapshot")||value("--from")||args.includes("--quiesced")||(mode==="--verify"&&value("--to"))||(mode==="--restore"&&!value("--to")))throw Error("staging_invalid_arguments");
      result=mode==="--verify"?await verifyStagingBackup({snapshotDir:value("--snapshot")}):await restoreStagingBackup({snapshotDir:value("--snapshot"),destinationDir:value("--to")});
    }
    console.log(JSON.stringify(result));
  }catch(error){console.error(JSON.stringify({status:"failed",error:/^(?:staging|backup)_[a-z_]{1,60}$/.test(error.message)?error.message:"staging_io_or_format_error"}));process.exitCode=1;}
}
