/* 非当前会话请求：来电 → 查岗 → 聊天请求，持久化队列与刷新式会话切换。 */
(()=>{
'use strict';
const KEY='CHAT_APP_V3_incomingRequests',CFG=KEY+'_config',NEXT=KEY+'_open',DAY=86400000;
const E=window.CheckInEngine,U=window.CheckInUI;if(!E||!U)return;
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f;}catch{return f;}};
const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const config=()=>Object.assign({frequency:'quiet',call:.2,chat:.5},read(CFG,{}));
const engine=id=>E.create({storage:localStorage,key:'CHAT_APP_V3_checkIn_'+id,id:()=>crypto.randomUUID()});
const list=()=>typeof sessionList==='undefined'?[]:sessionList;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
let busy=false,skips=0,shown=null;
const dialog=el('dialog');dialog.className='ck-dialog';dialog.id='cross-incoming';dialog.setAttribute('aria-label','跨桌面请求');
// Reuse theme and sizing of the check-in dialogs.
dialog.style.cssText='box-sizing:border-box;width:min(480px,calc(100% - 28px));max-height:85dvh;overflow:auto;border:1px solid var(--border-color);border-radius:24px;background:var(--secondary-bg);color:var(--text-primary);padding:24px;margin:auto';
document.body.append(dialog);
const title=r=>r.kind==='call'?`${r.name}想和你视频` :r.kind==='chat'?`${r.name}想找你聊聊天`:`${r.name}来查岗了`;
function clean(){let queue=read(KEY,[]),changed=false;const ids=new Set(list().map(s=>s.id));queue=queue.filter(r=>ids.has(r.session));for(const r of queue){if(r.kind==='checkin'&&r.status==='pending'){const q=engine(r.session).data.records.find(q=>q.id===r.questionId);if(q?.status==='answered'){r.status='read';r.doneAt=q.doneAt;changed=true;}}}for(const r of queue)if(r.status==='pending'&&Date.now()-r.at>=DAY){r.status='missed';r.doneAt=Date.now();changed=true;}
 const next=queue.filter(r=>r.status==='pending'||Date.now()-(r.doneAt||r.at)<DAY).slice(-20);if(changed||JSON.stringify(next)!==JSON.stringify(read(KEY,[])))write(KEY,next);return next;
}
function update(id,patch){const queue=read(KEY,[]),r=queue.find(x=>x.id===id);if(r){Object.assign(r,patch);write(KEY,queue);}return r;}
async function inject(r){
 const entries=[];
 if(r.kind==='checkin'){
  const e=engine(r.session);e.clean();const q=e.data.records.find(x=>x.id===r.questionId);if(!q)return;
  entries.push({id:'ck-system-'+q.id,text:esc(r.name+'来查岗了'),sender:'system',type:'system',timestamp:new Date(q.at)}, {id:'ck-card-'+q.id,text:U.card(q),sender:r.name,type:'check-in',timestamp:new Date(q.at+1)});
 }else entries.push({id:'incoming-'+r.id,text:esc(r.kind==='call'?`${r.name}的视频邀请${r.status==='missed'?'已超时未接':''}`:`${r.name}想找你聊聊天`),sender:'system',type:'system',timestamp:new Date(r.at)});
 if(r.session===U.session()){for(const m of entries)U.put(m.id,m.text,m.sender,m.type,m.timestamp.getTime());}
 else {const key=`${APP_PREFIX}${r.session}_chatMessages`,saved=await localforage.getItem(key)||[];for(const m of entries)if(!saved.some(x=>String(x.id)===m.id))saved.push({...m,status:'received',checkInInteraction:true});await localforage.setItem(key,saved);}
 if(r.kind==='checkin'){const e=engine(r.session),q=e.data.records.find(x=>x.id===r.questionId);if(q){q.delivered=true;e.save();}}
 update(r.id,{injected:true});
}
async function later(){if(!shown)return;const r=shown;shown=null;dialog.close();try{await inject(r);update(r.id,{status:'read',doneAt:Date.now()});}catch{showNotification('暂时无法保存，查岗仍在待处理队列中','warning');}}
dialog.addEventListener('cancel',e=>{e.preventDefault();later();});
async function openNow(r){
 shown=null;dialog.close();write(NEXT,{id:r.id,session:r.session});
 if(r.session!==U.session()){
  // Persist current chat before using the site's existing hash/reload session switch.
  if(typeof saveData==='function')await saveData();
  location.hash=r.session;location.reload();
 }else await resume();
}
async function resume(){const next=read(NEXT,null);if(!next||next.session!==U.session()||!U.ready())return;const r=clean().find(r=>r.id===next.id);if(!r||r.status==='missed'){localStorage.removeItem(NEXT);return;}
 await inject(r);update(r.id,{status:'read',doneAt:Date.now()});localStorage.removeItem(NEXT);
 if(r.kind==='checkin'){U.drain();U.open(r.questionId);}
 else if(r.kind==='call')window.callFeature?.startCall(true);
 else U.put('incoming-hello-'+r.id,'宝宝，在吗？',r.name,'normal');
}
function prompt(r){if(document.hidden||shown||U.typing()||U.modalBusy()||U.gated())return;shown=r;dialog.replaceChildren(el('h2',title(r)),el('p',r.kind==='checkin'?r.text:'现在回到这个聊天吗？'),button('稍后',later),button(r.kind==='call'?'现在接听':'现在回复',()=>openNow(r)));dialog.showModal();}
async function flush(){if(!U.ready())return;await resume();const queue=clean();for(const r of queue)if(r.status==='missed'&&!r.injected)await inject(r);const pending=queue.find(r=>r.status==='pending');if(pending)prompt(pending);}
async function tick(){
 if(!U.ready()||U.gated())return;
 const obstructed=U.typing()||U.modalBusy();if(obstructed){if(++skips<5)return;skips=0;}else skips=0;
 const cfg=config(),[,cooldown]=E.frequencies[cfg.frequency]||E.frequencies.quiet;
 let queue=clean();if(queue.length>=20){queue=queue.filter(r=>r.status==='pending');write(KEY,queue);if(queue.length>=20)return;}
 for(const s of list()){
  if(s.id===U.session()||queue.some(r=>r.session===s.id&&r.status==='pending'))continue;
  const e=engine(s.id),c=e.data.config,h=new Date().getHours();
  if(!c.enabled||!c.away||c.night&&(h>=22||h<7)||e.pending())continue;
  if(Date.now()-Math.max(e.data.lastAway||0,e.data.lastAt||0)<cooldown*60000)continue;
  const preferences=await localforage.getItem(`${APP_PREFIX}${s.id}_chatSettings`)||{};
  const name=preferences.partnerName||s.name||'对方';let kind=null,q=null;
  // Independent sequential rolls: later types are checked only if earlier ones miss.
  if(localStorage.getItem('callFeatureEnabled')!=='false'&&Math.random()*100<cfg.call)kind='call';
  else {
   const records=await localforage.getItem(`${APP_PREFIX}${s.id}_chatMessages`)||[];
   const recent=records.filter(m=>Date.now()-new Date(m.timestamp).getTime()<3600000).map(m=>String(m.text||'').replace(/<[^>]*>/g,''));
   q=e.issue({away:true,frequency:cfg.frequency,recent});
   if(q)kind='checkin';else if(Math.random()*100<cfg.chat)kind='chat';
  }
  if(!kind)continue;
  const r={id:crypto.randomUUID(),session:s.id,name,kind,at:Date.now(),status:'pending',questionId:q?.id,text:q?U.textFor(q):'',injected:false};
  e.data.lastAway=Date.now();e.save();queue.push(r);write(KEY,queue);
  if(document.hidden&&'Notification'in window&&Notification.permission==='granted'){try{const n=new Notification(title(r),{body:'返回页面处理这条邀请',tag:'incoming-'+s.id});n.onclick=()=>{window.focus();n.close();};}catch{}}
  // Force delivery means persist the request, never bypass the lock or a live call.
  if(!obstructed)prompt(r);
  if(queue.length>=20)break;
 }
}
async function run(fn){if(busy)return;busy=true;try{if(navigator.locks)await navigator.locks.request('chat-incoming-requests',{ifAvailable:true},lock=>lock?fn():undefined);else await fn();}catch(error){console.warn('跨桌面请求暂缓',error);}finally{busy=false;}}
window.IncomingRequests={config,configure:values=>write(CFG,{...config(),...values})};
setInterval(()=>run(tick),60000);setInterval(()=>run(flush),1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)run(flush);});
})();
