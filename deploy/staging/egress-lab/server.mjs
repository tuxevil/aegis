import http from 'node:http';
for(const port of [80,443])http.createServer((req,res)=>res.end('AEGIS synthetic network fixture')).listen(port,'0.0.0.0');
