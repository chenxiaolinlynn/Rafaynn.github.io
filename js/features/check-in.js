/* 查岗：一位对象，共用题库，聊天内题卡与离开聊天后的待处理邀请。 */
(()=>{
'use strict';
const E=window.CheckInEngine;if(!E)return;
const $=id=>document.getElementById(id), node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const session=()=>typeof SESSION_ID!=='undefined'?SESSION_ID:null;
const partner=()=>settings.partnerName||'对方';
let engine=null,sessionId=null,deferrals=0,lastTyped=0,answerId=null,draining=false;
const toast=t=>showNotification(t,'info');
function ready(){if(!session()||typeof messages==='undefined'||!window.musicTogetherBridge)return false;if(sessionId!==session()){sessionId=session();engine=E.create({storage:localStorage,key:'CHAT_APP_V3_checkIn_'+sessionId,id:()=>crypto.randomUUID()});deferrals=0;answerId=null;if(answerDialog.open)answerDialog.close();if(incoming.open)incoming.close();}return true;}
function persist(){try{engine.save();return true;}catch{toast('查岗保存失败，请检查浏览器存储空间');return false;}}
function visible(n){return !!n&&n.getClientRects().length>0&&getComputedStyle(n).visibility!=='hidden';}
function modalBusy(){return [...document.querySelectorAll('dialog[open],.modal,.video-call-overlay,.call-overlay')].some(n=>n!==answerDialog&&n!==incoming&&visible(n));}
function typing(){return Date.now()-lastTyped<5000||!!$('message-input')?.value.trim();}
function gated(){
 const h=new Date().getHours(),c=engine.data.config,hc=window.HeartMarket?.config;
 if(c.night&&(h>=22||h<7))return true;
 if(hc?.nightOn&&(hc.nightStart>hc.nightEnd?h>=hc.nightStart||h<hc.nightEnd:h>=hc.nightStart&&h<hc.nightEnd))return true;
 if(hc?.messageLimit>0&&messages.filter(m=>new Date(m.timestamp).toDateString()===new Date().toDateString()).length>=hc.messageLimit)return true;
 return !!window.isAppLocked||!!window.isInCall||['lock-screen','app-lock','call-window','call-mini-pill','call-incoming-overlay'].some(id=>visible($(id)));
}
const textFor=r=>r.direction==='meToTa'?'要不要来查查我呀？':r.question.type==='action'?(r.question[r.actionDirection]||r.question.text):r.question.text;
function put(id,text,sender,type='normal',at=Date.now()){
 if(messages.some(m=>String(m.id)===id))return;
 addMessage({id,text,sender,type,timestamp:new Date(at),status:'received',checkInInteraction:true});
}
function card(r){return `<div class="ck-card"><small>CHECK IN · 查岗</small><strong>${esc(textFor(r))}</strong><button type="button" data-ck-id="${esc(r.id)}">${r.status==='answered'?'查看回答':r.status==='missed'?'已超时 · 查看':'回答查岗'}</button></div>`;}
function deliver(r){
 put('ck-system-'+r.id,esc(partner()+'来查岗了'),'system','system',r.at);
 put('ck-card-'+r.id,card(r),partner(),'check-in',r.at+1);
 r.delivered=true;persist();
}
function refreshCard(r){const m=messages.find(m=>m.id==='ck-card-'+r.id);if(m&&m.text!==card(r)){m.text=card(r);if(typeof throttledSaveData==='function')throttledSaveData();}document.querySelectorAll('[data-ck-id]').forEach(b=>{if(b.dataset.ckId===r.id)b.textContent=r.status==='answered'?'查看回答':r.status==='missed'?'已超时 · 查看':'回答查岗';});}
const style=node('style');style.textContent=`
#ck-settings,#ck-answer,#ck-incoming,#ck-editor{box-sizing:border-box;width:min(480px,calc(100% - 28px));max-height:85dvh;overflow:auto;border:1px solid var(--border-color);border-radius:24px;background:var(--secondary-bg);color:var(--text-primary);padding:24px;margin:auto}
.ck-dialog::backdrop{background:#0005}.ck-dialog h2{margin:0;font-size:20px}.ck-dialog header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.ck-dialog button,.ck-card button{font:inherit;border:0;border-radius:12px;padding:10px 14px;background:var(--message-received-bg);color:var(--text-primary);cursor:pointer}.ck-dialog .ck-primary,.ck-card button{background:var(--accent-color);color:var(--message-sent-text)}.ck-dialog label{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:14px 0}.ck-dialog input,.ck-dialog textarea,.ck-dialog select{box-sizing:border-box;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);border-radius:10px;font:inherit;padding:9px;max-width:100%}.ck-dialog input[type=number]{width:85px}.ck-dialog input[type=checkbox]{accent-color:var(--accent-color)}.ck-dialog textarea{width:100%;min-height:75px;resize:vertical}.ck-dialog p,.ck-dialog small{color:var(--text-secondary);line-height:1.7}.ck-question{padding:14px;border:1px solid var(--border-color);border-radius:16px;margin:12px 0}.ck-actions{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.ck-card{min-width:190px;max-width:270px;padding:12px 4px}.ck-card small{display:block;color:var(--text-secondary);letter-spacing:2px;font-size:10px}.ck-card strong{display:block;margin:14px 0}.ck-card button{display:block;width:100%}.ck-options{display:grid;gap:10px;margin-top:20px}.ck-dialog .ck-field{display:block}.ck-field input{width:100%;margin-top:8px}
`;document.head.append(style);
function dialog(id,title){const d=node('dialog');d.id=id;d.className='ck-dialog';d.setAttribute('aria-label',title);const h=node('header');h.append(node('h2',title),button('关闭',()=>d.close()));d.append(h);document.body.append(d);return d;}
const settingsDialog=dialog('ck-settings','查岗设置'),settingsBody=node('div');settingsDialog.append(settingsBody);
const answerDialog=dialog('ck-answer','回答查岗'),answerBody=node('div');answerDialog.append(answerBody);
const incoming=dialog('ck-incoming','对方来查岗了'),incomingBody=node('div');incoming.append(incomingBody);
const editor=dialog('ck-editor','编辑题卡'),editorBody=node('div');editor.append(editorBody);
const entry=button('查岗 · 开关与题库',()=>{if(ready()){renderSettings();settingsDialog.showModal();}});entry.className='setting-pill-row';entry.style.width='100%';entry.id='ck-settings-entry';$('cs-panel-chat')?.append(entry);
$('message-input')?.addEventListener('input',()=>lastTyped=Date.now());
function field(parent,title,input){const l=node('label',title);l.append(input);parent.append(l);return input;}
function renderSettings(){
 settingsBody.replaceChildren();const c=engine.data.config,inputs={};
 for(const [k,label]of [['enabled','开启对方查岗'],['away','离开聊天时也可以查岗'],['night','夜间免打扰（22:00–07:00）']]){const i=node('input');i.type='checkbox';i.checked=c[k];i.setAttribute('aria-label',label);inputs[k]=field(settingsBody,label,i);}
 for(const [k,label,max]of [['chance','每轮聊天触发概率（%）',100],['cooldown','查岗冷却（分钟）',1440],['autoOpen','自动打开答题框（%）',100]]){const i=node('input');i.type='number';i.min=0;i.max=max;i.value=c[k];i.setAttribute('aria-label',label);inputs[k]=field(settingsBody,label,i);}
 const frequency=node('select');for(const [v,t]of [['quiet','安静 · 1% / 180 分钟'],['standard','标准 · 2% / 30 分钟'],['quieter','更安静 · 0.5% / 360 分钟'],['quietest','最安静 · 0.2% / 720 分钟']]){const o=node('option',t);o.value=v;frequency.append(o);}frequency.value=c.frequency;field(settingsBody,'离开聊天时的频率',frequency);
 settingsBody.append(button('保存设置',()=>{const next={...c,frequency:frequency.value};for(const[k,i]of Object.entries(inputs)){if(i.type==='checkbox')next[k]=i.checked;else{const v=Number(i.value);if(!i.value.trim()||!Number.isFinite(v)||v<0||v>Number(i.max))return toast('请输入范围内的数字');next[k]=v;}}engine.data.config=next;if(persist())toast('查岗设置已保存');}));
 settingsBody.append(node('p','同一时间只保留一条待回答查岗；题目不会连续重复。页面关闭后不会在后台运行，重新打开可继续回答已保存的题卡。'));
 settingsBody.append(button('开启后台系统通知',async()=>{if(!('Notification'in window))return toast('当前浏览器不支持系统通知');const result=await Notification.requestPermission();toast(result==='granted'?'已允许通知':'未开启通知，返回页面后仍可查看查岗');}));
 const pending=engine.pending();if(pending)settingsBody.append(button('查看待回答查岗',()=>openAnswer(pending.id)));
 const list=node('div');list.append(node('h3','共用题库'));
 for(const q of engine.data.questions){const row=node('div');row.className='ck-question';const on=node('input');on.type='checkbox';on.checked=q.enabled;on.onchange=()=>{q.enabled=on.checked;persist();};field(row,q.text,on);row.append(node('small',q.type==='action'?'互动题':q.options?.length?'单选题':'填空题'),button('编辑',()=>editQuestion(q)));list.append(row);}
 list.append(button('添加题卡',()=>editQuestion()));settingsBody.append(list);
 const pool=node('textarea');pool.value=engine.data.replies.join('\n');pool.setAttribute('aria-label','询问回应池');settingsBody.append(node('h3','询问 · 回应池'),node('p','每行一句，用于填空题回复'),pool,button('保存回应池',()=>{const lines=pool.value.split('\n').map(x=>x.trim()).filter(Boolean);if(!lines.length)return toast('至少保留一句回复');engine.data.replies=lines;if(persist())toast('回应池已保存');}));
}
function editQuestion(existing){
 const q=existing?JSON.parse(JSON.stringify(existing)):{id:crypto.randomUUID(),type:'single',enabled:true,text:'',options:[]};editorBody.replaceChildren();
 const title=node('input');title.value=q.text;title.maxLength=200;title.setAttribute('aria-label','题目');field(editorBody,'题目',title);
 const type=node('select');for(const[v,t]of [['single','单选题'],['blank','填空题'],['action','互动题']]){const o=node('option',t);o.value=v;type.append(o);}type.value=q.type==='action'?'action':q.options?.length?'single':'blank';field(editorBody,'题型',type);
 const content=node('div');editorBody.append(content);let optionInputs=[],actionInputs={};
 const lines=s=>s.split('\n').map(x=>x.trim()).filter(Boolean);
 function draw(){content.replaceChildren();optionInputs=[];actionInputs={};
  if(type.value==='single'){
   const add=(opt={t:'',reply:[]})=>{const row=node('div');row.className='ck-question';const t=node('input');t.value=opt.t;t.maxLength=100;field(row,'选项',t);const r=node('textarea');r.placeholder='该选项的回复，每行一句';r.value=(opt.reply||[]).join('\n');row.append(r);const item={t,r};optionInputs.push(item);row.append(button('移除此选项',()=>{optionInputs=optionInputs.filter(x=>x!==item);row.remove();}));content.insertBefore(row,addButton);};
   const addButton=button('添加选项',()=>add());content.append(addButton);(q.options?.length?q.options:[{t:'',reply:[]},{t:'',reply:[]}]).forEach(add);
  }else if(type.value==='action')for(const[k,t]of [['toMe','对方对你做的题面'],['toTa','邀请你对对方做的题面'],['accept','好呀 · 回复池（每行一句）'],['reject','不要 · 回复池（每行一句）']]){const i=node('textarea');i.value=Array.isArray(q[k])?q[k].join('\n'):q[k]||'';field(content,t,i);actionInputs[k]=i;}
  else content.append(node('p','由你输入文字，对方从「询问 · 回应池」随机回复'));
 }
 type.onchange=draw;draw();editorBody.append(button('保存题卡',()=>{
  q.text=title.value.trim();if(!q.text)return toast('请填写题目');q.type=type.value==='action'?'action':'single';q.options=[];
  if(type.value==='single'){q.options=optionInputs.map(x=>({t:x.t.value.trim(),reply:lines(x.r.value)}));if(q.options.length<2||q.options.some(x=>!x.t||!x.reply.length))return toast('至少两个选项，每个选项都需要回复池');}
  if(type.value==='action'){for(const[k,i]of Object.entries(actionInputs))q[k]=['accept','reject'].includes(k)?lines(i.value):i.value.trim();if(!q.toMe||!q.toTa||!q.accept.length||!q.reject.length)return toast('请填写两个方向的题面和回复池');}
  const index=engine.data.questions.findIndex(x=>x.id===q.id);if(index<0)engine.data.questions.push(q);else engine.data.questions[index]=q;if(persist()){editor.close();renderSettings();}
 }));editor.showModal();
}
function openAnswer(id){if(!ready())return;engine.clean();const r=engine.data.records.find(x=>x.id===id);if(!r)return toast('这条查岗已不在待处理记录中');answerId=id;answerBody.replaceChildren(node('p',textFor(r)));
 if(r.status!=='pending'){answerBody.append(node('p',r.status==='missed'?'查岗已超过 24 小时，记为未接':`你的回答：${r.answer}`));if(r.reply)answerBody.append(node('p',`${partner()}：${r.reply}`));}
 else{
  const options=node('div');options.className='ck-options';answerBody.append(options);
  const submit=(value,questionId)=>{try{const result=engine.answer(id,value,questionId);if(!result)return toast('这条查岗已处理');put('ck-answer-'+id,esc(result.answer),'user');refreshCard(result);answerDialog.close();drain();}catch(e){toast(e.message);}};
  if(r.direction==='meToTa'){options.append(button('好呀',()=>{options.replaceChildren(node('p','选一道题问问对方'));for(const q of engine.data.questions.filter(q=>q.enabled))options.append(button(q.text,()=>submit('accept',q.id)));}),button('不要',()=>submit('reject')));}
  else if(r.question.type==='action')options.append(button('好呀',()=>submit('accept')),button('不要',()=>submit('reject')));
  else if(r.question.options?.length)r.question.options.forEach((o,i)=>options.append(button(o.t,()=>submit(i))));
  else {const input=node('textarea');input.maxLength=500;input.placeholder='写下你的回答';options.append(input,button('发送回答',()=>submit(input.value)));}
 }
 if(!answerDialog.open)answerDialog.showModal();
}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-ck-id]');if(b)openAnswer(b.dataset.ckId);});
function showIncoming(r){if(incoming.open||answerDialog.open||modalBusy()||typing()||document.hidden)return;incomingBody.replaceChildren(node('p',partner()+'来查岗了'),node('p',textFor(r)),button('稍后',()=>{r.notified=true;persist();incoming.close();}),button('现在回复',()=>{r.notified=true;persist();incoming.close();openAnswer(r.id);}));r.notified=true;persist();incoming.showModal();}
function recent(){return messages.filter(m=>Date.now()-new Date(m.timestamp).getTime()<3600000).map(m=>String(m.text||'').replace(/<[^>]*>/g,''));}
function attempt(away){
 if(!ready()||gated()||!engine.data.config.enabled)return;
 if(away&&(typing()||modalBusy())&&!document.hidden){if(++deferrals<5)return;deferrals=0;}else deferrals=0;
 const r=engine.issue({away,recent:recent()});if(!r)return;
 deliver(r);
 if(away){
  // After repeated deferral deliver only the passive card, never force a modal over typing/calls.
  if(document.hidden&&'Notification'in window&&Notification.permission==='granted'){try{const n=new Notification(partner()+'来查岗了',{body:'有一张待回答的查岗题卡',tag:'check-in'});n.onclick=()=>{window.focus();n.close();};}catch{}}
  else showIncoming(r);
  deferrals=0;
 }else if(Math.random()*100<engine.data.config.autoOpen){const sid=sessionId;setTimeout(()=>{if(ready()&&sessionId===sid&&r.status==='pending'&&!gated()&&!typing()&&!modalBusy()&&!document.hidden&&!incoming.open&&!answerDialog.open)openAnswer(r.id);},400);}
}
window.addEventListener('chat-message-added',e=>{const m=e.detail;if(m?.type==='normal'&&m.sender!=='user'&&m.sender!=='system'&&!m.checkInInteraction&&!m.musicInteraction&&!document.hidden&&!modalBusy()&&!incoming.open&&!answerDialog.open)attempt(false);});
function drain(){
 if(draining||!ready())return;draining=true;
 try{if(engine.clean())persist();for(const r of engine.data.records){if(!r.delivered)deliver(r);if(r.status==='answered'&&!r.replySent&&Date.now()>=r.replyAt&&!gated()&&!document.hidden){put('ck-answer-'+r.id,esc(r.answer),'user','normal',r.doneAt);put('ck-reply-'+r.id,esc(r.reply),partner(),'normal',r.replyAt);r.replySent=true;persist();}refreshCard(r);}const r=engine.pending();if(r?.away&&!r.notified&&!gated())showIncoming(r);}finally{draining=false;}
}
setInterval(()=>{if(!ready())return;const away=document.hidden||modalBusy();if(away)attempt(true);drain();},60000);
setInterval(drain,1000);
window.addEventListener('storage',e=>{if(e.key==='CHAT_APP_V3_checkIn_'+sessionId){engine=E.create({storage:localStorage,key:e.key,id:()=>crypto.randomUUID()});if(answerDialog.open&&answerId)openAnswer(answerId);}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)drain();});
})();
