set -eu
curl --noproxy '*' --connect-timeout 1 --max-time 2 -fsS http://192.0.2.10:443/ > /dev/null
printf '%s\n' '{"probe":"approved_fixture_ip_tcp443","result":"allowed"}'
for target in http://192.0.2.11:443/ http://169.254.169.254:443/ http://192.0.2.10:80/ http://127.0.0.1:443/; do
 if curl --noproxy '*' --connect-timeout 1 --max-time 2 -fsS "$target" > /dev/null 2>&1; then
  printf '%s\n' '{"result":"unexpected_access"}'; exit 1
 fi
 printf '{"probe":"%s","result":"blocked"}\n' "$target"
done
node -e 'const f=require("fs");const s=f.readFileSync("/proc/self/status","utf8");if(!/^Uid:\s+1000\s/m.test(s)||!/^CapEff:\s+0+$/m.test(s))throw Error("privilege_drop_failed");console.log(JSON.stringify({uid:process.getuid(),capabilities:"none"}))'
