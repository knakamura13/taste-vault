const dev = import.meta.env.DEV;
import { timingSafeEqual } from 'node:crypto';
/** @param {string} a @param {string} b */
function same(a,b) { const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y); }
/** @type {import('@sveltejs/kit/hooks').Handle} */
export const handle = async ({event,resolve}) => {
 const host=process.env.HOST || (dev ? '127.0.0.1' : '0.0.0.0');
 const required=process.env.TASTE_REQUIRE_AUTH==='true' || (!dev && !['127.0.0.1','localhost','::1'].includes(host));
 if(!required) return resolve(event);
 const web=process.env.TASTE_WEB_PASSWORD, read=process.env.TASTE_API_READ_TOKEN, write=process.env.TASTE_API_WRITE_TOKEN;
 if(!web || !read || !write || same(read,write)) return new Response('Access is not configured.',{status:503});
 if(event.url.pathname==='/healthz' && event.request.method==='GET') return resolve(event);
 const authorization=event.request.headers.get('authorization') || '';
 if(event.url.pathname.startsWith('/api/')) {
  const token=authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const ok=event.request.method==='GET' ? (same(token,read)||same(token,write)) : same(token,write);
  if(!ok)return Response.json({error:{code:'unauthorized',message:'Valid credentials required.'}},{status:401,headers:{'www-authenticate':'Bearer'}});
 } else {
  let credentials=''; if(authorization.startsWith('Basic ')){try{credentials=Buffer.from(authorization.slice(6),'base64').toString('utf8');}catch{}}
  if(!same(credentials,`${process.env.TASTE_WEB_USER||'taste'}:${web}`)) return new Response('Authentication required.',{status:401,headers:{'www-authenticate':'Basic realm="Taste Vault", charset="UTF-8"'}});
 }
 return resolve(event);
}
