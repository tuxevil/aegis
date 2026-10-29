import fs from 'node:fs/promises';
import {publicIPv4} from '../../../hazards/inamhi-transport.js';
import {validateInamhiAuthorization} from '../../../hazards/inamhi-bridge.js';
const mode=process.argv[2];
if(!['--preflight','--execute-manual'].includes(mode))throw Error('explicit_mode_required');
const file='/authorization/query.json',stat=await fs.lstat(file);
if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16000||(stat.mode&0o077))throw Error('private_policy_required');
const policy=JSON.parse(await fs.readFile(file,'utf8'));
if(mode==='--execute-manual')validateInamhiAuthorization(policy);
if(policy.sourceId!=='inamhi.warning.pdf'||!Array.isArray(policy.approvedAddresses)||policy.approvedAddresses.length>4||policy.approvedAddresses.some(ip=>!publicIPv4(ip)))throw Error('invalid_addresses');
const elements=policy.approvedAddresses.length?'elements = { '+policy.approvedAddresses.join(', ')+' };':'';
await fs.writeFile('/tmp/aegis-manual-egress.nft',`table inet aegis_manual_once {
 set approved { type ipv4_addr; ${elements} }
 chain output { type filter hook output priority 0; policy drop;
  ip daddr @approved tcp dport 443 ct state { new, established } counter accept
  ip daddr 1.1.1.1 udp dport 53 counter accept
  ip daddr 1.1.1.1 tcp dport 53 counter accept
  counter drop
 }
 chain input { type filter hook input priority 0; policy drop; ct state established counter accept; counter drop; }
}`);
