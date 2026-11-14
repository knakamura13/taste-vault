// Each connection resolves and pins a public address. Chromium must send all traffic through this proxy.
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

/** @param {string} value */
export function isPublicAddress(value) {
 try { const ip=ipaddr.process(value); return ip.range()==='unicast' && (!(ip instanceof ipaddr.IPv6) || ip.match(ipaddr.IPv6.parse('2000::'),3)); } catch { return false; }
}
/** @param {string} host @param {string} port */
async function target(host,port) {
 if(!['80','443'].includes(String(port))) throw Error('Only HTTP and HTTPS ports are allowed');
 const addresses=net.isIP(host)?[{address:host}]:await dns.lookup(host,{all:true,verbatim:true});
 if(!addresses.length || addresses.some(({address})=>!isPublicAddress(address))) throw Error('Address is not public');
 return addresses[0].address;
}
/** @param {string} value */
export function validateIntakeUrl(value) { const url=new URL(value); const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase(); const port=url.port||(url.protocol==='https:'?'443':'80'); if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!['80','443'].includes(port)||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||(net.isIP(host)&&!isPublicAddress(host))) throw Error('Only public HTTP(S) URLs are allowed'); return url; }
/** @param {string} value */
export async function validatePublicUrl(value) { const url=validateIntakeUrl(value); await target(url.hostname.replace(/^\[|\]$/g,''),url.port||(url.protocol==='https:'?'443':'80')); return url; }
export async function createPublicProxy() {
 const server=http.createServer(async (req,res)=>{ try { const url=new URL(req.url || ''); if(url.protocol!=='http:'||url.username||url.password) throw Error('Invalid URL'); const port=url.port||'80', address=await target(url.hostname,port); const upstream=http.request({host:address,port,method:req.method,path:url.pathname+url.search,headers:{...req.headers,host:url.host}},response=>{res.writeHead(response.statusCode||502,response.headers);response.pipe(res);}); upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();}); req.pipe(upstream); }catch{res.writeHead(403);res.end();} });
 server.on('connect',async (req,client,head)=>{try{const url=new URL('http://'+req.url);const port=url.port||'443',address=await target(url.hostname.replace(/^\[|\]$/g,''),port);const upstream=net.connect(Number(port),address,()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);upstream.pipe(client);client.pipe(upstream);});upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());}catch{client.end('HTTP/1.1 403 Forbidden\r\n\r\n');}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(undefined));});
 return {server,port:/** @type {import('node:net').AddressInfo} */ (server.address()).port};
}
