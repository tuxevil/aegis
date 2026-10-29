set -eu
test "$#" -eq 1
case "$1" in --preflight|--execute-manual) ;; *) exit 2 ;; esac
test -f /.dockerenv
test -n "${AEGIS_FORBIDDEN_NETNS:-}"
test "$(readlink /proc/self/ns/net)" != "$AEGIS_FORBIDDEN_NETNS"
setpriv --reuid 1000 --regid 1000 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
 node /app/deploy/staging/manual-network/prepare.mjs "$1"
nft --check --file /tmp/aegis-manual-egress.nft
nft --file /tmp/aegis-manual-egress.nft
nft --json list table inet aegis_manual_once > /tmp/aegis-manual-network-setup.json
exec setpriv --reuid 1000 --regid 1000 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
 node /app/deploy/staging/manual-network/run-app.mjs "$1"
