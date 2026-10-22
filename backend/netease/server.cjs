process.env.ENABLE_GENERAL_UNBLOCK='false';
const http=require('http'),fs=require('fs'),path=require('path');
// Suppress upstream debug output that may contain login response cookies.
console.log=console.error=console.warn=()=>{};
const api=require(process.env.NCM_API_MODULE || '@neteasecloudmusicapienhanced/api');
const token=process.env.ACCESS_TOKEN;
if(!token || token.length<32) throw Error('ACCESS_TOKEN must contain at least 32 characters');
const allowedOrigin=process.env.ALLOWED_ORIGIN;
if(!allowedOrigin) throw Error('ALLOWED_ORIGIN is required');
let cookie='',key='',uid=null;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method==='GET' && req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}));return;}
 res.setHeader('Vary','Origin');
 if(req.headers.origin && req.headers.origin!==allowedOrigin){res.writeHead(403);res.end();return;}
 if(req.headers.origin===allowedOrigin) res.setHeader('Access-Control-Allow-Origin',allowedOrigin);
 if(req.method==='OPTIONS'){
 res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
 res.writeHead(204);res.end();return;
 }
 const supplied=Buffer.from(req.headers.authorization || '');
 const expected=Buffer.from('Bearer '+token);
 if(supplied.length!==expected.length || !require('crypto').timingSafeEqual(supplied,expected)){res.writeHead(401);res.end(JSON.stringify({error:'访问密钥不正确'}));return;}
 if(req.method!=='POST'){res.writeHead(405);res.end();return;}
 const send=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 try{
 let text='';for await(const part of req){text+=part;if(text.length>4096)throw Error();}const data=JSON.parse(text||'{}');
 const call=async(name,args={})=>(await api[name]({...args,cookie,timeout:12000,timestamp:Date.now()})).body;
 if(req.url==='/qr'){
 const r=await call('login_qr_key');key=r.data.unikey;
 const q=await call('login_qr_create',{key,qrimg:true});send({image:q.data.qrimg});
 }else if(req.url==='/check'){
 const r=await call('login_qr_check',{key});if(r.code===803){cookie=r.cookie;key='';}send({code:r.code});
 }else if(req.url==='/account'){
 const r=await call('user_account');uid=r.profile?.userId;send({name:r.profile?.nickname,loggedIn:!!uid});
 }else if(req.url==='/playlists'&&uid){const r=await call('user_playlist',{uid,limit:100});send({items:(r.playlist||[]).map(p=>({id:p.id,name:p.name}))});
 }else if(req.url==='/tracks'&&uid){const r=await call('playlist_detail',{id:String(data.id)});send({items:(r.playlist?.tracks||[]).map(t=>({id:t.id,name:t.name,artist:(t.ar||[]).map(a=>a.name).join(' / ')}))});
 }else if(req.url==='/play'&&uid){let track=null,responded=false;
 for(const name of ['song_url_v1','song_url']) {
 try { const r=await call(name,{id:String(data.id),level:'standard',br:128000,crypto:'weapi',unblock:'false'});responded=true;track=r.data?.[0];if(track?.url)break; } catch {}
 }
 if(!track?.url){res.statusCode=502;send({error:responded?'网易云未返回这首歌的可用音源，可以换一首测试':'播放接口请求失败，请稍后重试'});return;}
 send({url:track.url,trial:!!track.freeTrialInfo});
 }else if(req.url==='/logout'){cookie='';key='';uid=null;send({ok:true});}
 else {res.statusCode=400;send({error:'请先登录'});}
 }catch{res.statusCode=502;send({error:'网易云接口暂时未响应，请重试'});}
});
server.listen(Number(process.env.PORT||4330),process.env.HOST||'127.0.0.1',()=>process.stdout.write('Music backend ready\n'));
server.requestTimeout=30000;
