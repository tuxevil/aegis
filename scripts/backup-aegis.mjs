import {createDataBackup,verifyDataBackup,restoreDataBackup} from "../backup.js";
const args=process.argv.slice(2),mode=args.filter(a=>["--backup","--verify","--restore"].includes(a));
if(!args.length) {
  console.log(JSON.stringify({status:"no_action",network:false,usage:["--backup --from=DATA_DIR --to=NEW_SNAPSHOT --quiesced","--verify --snapshot=SNAPSHOT","--restore --snapshot=SNAPSHOT --to=NEW_DATA_DIR"]}));
} else {
  try {
    if(mode.length!==1||new Set(args.map(a=>a.split("=")[0])).size!==args.length||args.some(a=>!/^--(?:backup|verify|restore|quiesced)$/.test(a)&&!/^--(?:from|to|snapshot)=.+$/.test(a)))throw new Error("backup_invalid_arguments");
    const value=key=>args.find(a=>a.startsWith(key+"="))?.slice(key.length+1),operation=mode[0];let result;
    if(operation==="--backup") {
      if(value("--snapshot"))throw new Error("backup_invalid_arguments");
      result=await createDataBackup({sourceDir:value("--from"),snapshotDir:value("--to"),quiesced:args.includes("--quiesced")});
    } else {
      if(value("--from")||args.includes("--quiesced")||(operation==="--verify"&&value("--to")))throw new Error("backup_invalid_arguments");
      result=operation==="--verify"?await verifyDataBackup({snapshotDir:value("--snapshot")}):await restoreDataBackup({snapshotDir:value("--snapshot"),destinationDir:value("--to")});
    }
    console.log(JSON.stringify(result));
  } catch(error) {
    console.error(JSON.stringify({status:"failed",error:/^backup_[a-z_]{1,60}$/.test(error.message)?error.message:"backup_io_or_format_error"}));process.exitCode=1;
  }
}
