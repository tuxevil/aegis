set -eu
test -f /.dockerenv
test -n "${AEGIS_FORBIDDEN_NETNS:-}"
test "$(readlink /proc/self/ns/net)" != "$AEGIS_FORBIDDEN_NETNS"
ip link set lo up
for address in 192.0.2.10 192.0.2.11 169.254.169.254; do ip address add "$address/32" dev lo; done
setpriv --reuid 1000 --regid 1000 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs node /lab/server.mjs &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
sleep 1
for target in http://192.0.2.10:443/ http://192.0.2.11:443/ http://169.254.169.254:443/ http://192.0.2.10:80/ http://127.0.0.1:443/; do
 curl --noproxy '*' --connect-timeout 1 --max-time 2 -fsS "$target" > /dev/null
done
printf '%s\n' '{"baseline":"all_five_fixture_targets_reachable_before_policy"}'
nft -f /lab/egress.nft
setpriv --reuid 1000 --regid 1000 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs sh /lab/probes.sh
nft --json list table inet aegis_fixture_egress
