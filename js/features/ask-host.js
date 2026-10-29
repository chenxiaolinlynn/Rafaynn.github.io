/* TA 主动询问：基于言序作品修改；AskCore and bank supplied by site owner. */
(() => {
'use strict';
const A=window.AskCore, $=id=>document.getElementById(id);
if(!A)return;
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const btn=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n;};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cats={daily:'日常询问',care:'关心询问',interact:'互动询问',world:'两个世界'};
let sid=null, timer=null, interval=null,lastTyped=0, answeringTs=null;
const name=()=>settings.partnerName||'对方';
const pool=()=>{
 let disabled=[];try{disabled=JSON.parse(localStorage.getItem('disabledReplyItems')||'[]');}catch{}
 const excluded=new Set(Array.isArray(disabled)?disabled:[]);
 (window.customReplyGroups||[]).filter(g=>g.disabled).forEach(g=>(g.items||[]).forEach(x=>excluded.add(x)));
 return (customReplies||[]).filter(x=>typeof x==='string'&&x.trim()&&!excluded.has(x));
};
const pick=()=>{const p=pool();return p.length?p[Math.floor(Math.random()*p.length)]:'';};
function put(id,text,sender,type){if(messages.some(m=>String(m.id)===id))return;addMessage({id,text,sender,type,timestamp:new Date(),status:sender==='user'?'sent':'received',askInteraction:true});}
function markup(c){
 const disabled=c.status==='answered'?' disabled':'';
 let html='<section class="ta-ask-card" data-ask-card="'+c.ts+'"><small>TA 想问你 · '+esc(cats[c.cat]||'询问')+'</small><strong>'+esc(c.text)+'</strong>';
 if(c.status==='answered')return html+'<p>已回答：'+esc(c.answer)+'</p><button data-ask-open="'+c.ts+'">查看回答</button></section>';
 if(c.type==='text')html+='<button data-ask-open="'+c.ts+'">回答问题</button>';
 else if(c.type==='single')c.options.forEach((o,i)=>{html+='<button data-ask-single="'+c.ts+'" data-option="'+i+'"'+disabled+'>'+esc(o.t)+'</button>';});
 else{
 html+='<small>'+(c.multiMax?'最多选 '+c.multiMax+' 项':'可多选')+'</small>';
 c.options.forEach((o,i)=>{html+='<label><input type="checkbox" data-ask-option="'+i+'"> '+esc(o.t)+'</label>';});
 html+='<button data-ask-multi="'+c.ts+'">提交回答</button>';
 }
 return html+'</section>';
}
function refresh(c){
 const html=markup(c),m=messages.find(m=>String(m.id)==='ta-ask-'+c.ts);
 if(m)m.text=html;
 document.querySelectorAll('[data-ask-card]').forEach(n=>{if(n.dataset.askCard===String(c.ts))n.outerHTML=html;});
 if(m)throttledSaveData();
}
function dialog(title){
 const d=el('dialog');d.className='ta-ask-dialog';d.setAttribute('aria-label',title);
 const h=el('header');h.append(el('h2',title),btn('关闭',()=>d.close()));d.append(h);
 d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();return d;
}
function answer(ts,value){
 let r;answeringTs=Number(ts);
 try{r=A.answerCard(Number(ts),value);}catch(e){showNotification('保存回答失败，请检查存储空间后重试','info');return false;}finally{answeringTs=null;}
 if(!r.ok){showNotification(({deadline:'已超过询问截止时间',answered:'这道题已经回答过了','over-cap':'超过可选数量','empty-answer':'请先填写或选择答案','not-found':'本设备没有这道题的记录'})[r.why]||'无法提交，请重新选择','info');return false;}
 return true;
}
function open(ts){
 const c=A._load().cards[ts];if(!c)return showNotification('本设备没有这道题的记录','info');
 const d=dialog('回答询问');d.append(el('p',c.text));
 if(c.status==='answered'){d.append(el('p','你的回答：'+c.answer),el('p',name()+'：'+c.reply));return;}
 if(c.type!=='text'){const n=el('div');n.innerHTML=markup(c);d.append(n);return;}
 const input=el('textarea');input.placeholder='写下你的回答';input.maxLength=2000;input.setAttribute('aria-label','你的回答');
 d.append(input,btn('发送回答',()=>{if(answer(ts,input.value))d.close();}));input.focus();
}
function busy(){return !!$('message-input')?.value.trim()||Date.now()-lastTyped<5000||[...document.querySelectorAll('dialog[open],.modal,#call-window,#call-mini-pill,#call-incoming-overlay')].some(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');}
function onAsk(c){
 put('ta-ask-notice-'+c.ts,esc(name()+'想问你一个问题'),name(),'system');
 put('ta-ask-'+c.ts,markup(c),name(),'ta-ask');
 if(A.shouldPopup(c)){
  if(document.hidden)A.queuePopup(c);
  else if(!busy())open(c.ts);
 }
}
function settingsView(){
 const d=dialog('TA 主动询问'),s=A.settings();
 function field(label,n){const l=el('label',label);l.append(n);d.append(l);return n;}
 function toggle(label,key){const i=el('input');i.type='checkbox';i.checked=!!s[key];i.onchange=()=>A.configure({[key]:i.checked});field(label,i);}
 toggle('开启主动询问','enabled');toggle('使用预设题库','useDefault');toggle('优先使用聊天字卡回复','useChatReply');
 const f=el('select');Object.entries({orig:'原频率',low1:'稍安静',low2:'安静',low3:'很安静'}).forEach(([v,t])=>{const o=el('option',t);o.value=v;f.append(o);});f.value=s.freq;f.onchange=()=>A.configure({freq:f.value});field('频率',f);
 const nums={};for(const [k,t,max]of [['prob','提问概率（%）',100],['popupProb','文本题自动弹出（%）',100],['dcf','动态概率闸（%）',100],['dcpMul','全局概率乘数',10]]){const i=el('input');i.type='number';i.min=0;i.max=max;i.step=k==='dcpMul'?.1:1;i.value=s[k];nums[k]=field(t,i);}
 const dl=el('input');dl.type='datetime-local';if(s.deadline){const date=new Date(s.deadline);dl.value=new Date(date-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}field('截止时间（留空不限）',dl);
 d.append(btn('保存参数',()=>{const patch={};for(const[k,i]of Object.entries(nums)){if(!i.value.trim()||!i.checkValidity())return showNotification('请输入范围内的数字','info');patch[k]=Number(i.value);}if(dl.value&&!Number.isFinite(new Date(dl.value).getTime()))return;A.configure(patch);A.setDeadline(dl.value?new Date(dl.value).getTime():0);showNotification('询问设置已保存','success');}));
 d.append(el('p','默认加载 60 秒后首试，每 4 分钟检查；提问冷却 45 分钟，互动卡间隔 60 分钟。网页关闭期间不运行。'));
 d.append(btn('立即提问',()=>{d.close();const r=A.triggerNow();if(!r.fired)showNotification(r.why==='deadline'?'已超过截止时间':'没有启用的题目','info');}),btn('提问记录',historyView),btn('添加自定义题目',edit));
 for(const [k,t]of Object.entries(cats)){const i=el('input');i.type='checkbox';i.checked=!s.catOff[k];i.onchange=()=>A.setCatOff(k,!i.checked);field(t,i);}
 const details=el('details');details.append(el('summary','题库（'+A.questions().length+' 题）'));
 A.questions().forEach(q=>{const row=el('div');row.className='ta-ask-question';const i=el('input');i.type='checkbox';i.checked=q.enabled!==false;i.onchange=()=>A.setQuestionEnabled(q.id,i.checked);const label=el('label',q.text);label.append(i);row.append(label,el('small',q.isPreset?'预设题 · 仅可启停':'自定义题'));if(!q.isPreset)row.append(btn('删除',()=>{A.removeQuestion(q.id);row.remove();}));details.append(row);});
 d.append(details,el('footer','基于言序作品修改 · 题库来源 mochi'));
}
function edit(){
 const d=dialog('添加询问题目'),text=el('textarea'),type=el('select'),cat=el('select'),options=el('textarea'),cap=el('input');
 text.placeholder='题目';text.setAttribute('aria-label','题目');
 for(const[v,t]of [['text','文本题'],['single','单选题'],['multi','多选题']]){const o=el('option',t);o.value=v;type.append(o);}
 Object.entries(cats).forEach(([v,t])=>{const o=el('option',t);o.value=v;cat.append(o);});
 options.placeholder='每行：选项 | 回复1;回复2';options.setAttribute('aria-label','选项与回复');
 cap.type='number';cap.min=0;cap.value=0;cap.setAttribute('aria-label','最多选择数');
 d.append(text,type,cat,el('p','选项题每行填写：选项 | 回复1;回复2'),options,el('p','多选上限：0 表示不限，限选时至少为 2'),cap,btn('保存题目',()=>{
  if(!text.value.trim())return showNotification('请填写题目','info');
  const opts=options.value.split('\n').filter(x=>x.trim()).map(line=>{const [t,...r]=line.split('|');return {t:t.trim(),reply:r.join('|').trim()};});
  if(type.value!=='text'&&(opts.length<2||opts.some(o=>!o.t)||new Set(opts.map(o=>o.t)).size!==opts.length))return showNotification('至少填写两个不同的选项','info');
  const n=Number(cap.value);if(type.value==='multi'&&(!Number.isInteger(n)||n<0||n===1||n>opts.length))return showNotification('请检查多选上限','info');
  A.addQuestion({text:text.value.trim(),type:type.value,cat:cat.value,options:opts,multiMax:n});d.close();showNotification('题目已添加，重新打开设置可查看','success');
 }));
}
function historyView(){const d=dialog('提问记录');const h=A.history().slice().reverse();if(!h.length)d.append(el('p','暂时没有提问'));h.forEach(r=>{const row=el('div');row.className='ta-ask-question';row.append(el('strong',r.q),el('p',new Date(r.ts).toLocaleString()),el('p',r.status==='answered'?'你的回答：'+r.a:'待回答'));if(r.reply)row.append(el('p',name()+'：'+r.reply));row.append(btn(r.status==='answered'?'查看':'回答',()=>open(r.ts)));d.append(row);});}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-ask-open],[data-ask-single],[data-ask-multi]');if(!b||!sid)return;
 if(b.dataset.askOpen)return open(b.dataset.askOpen);
 const ts=b.dataset.askSingle||b.dataset.askMulti,c=A._load().cards[ts];if(!c)return open(ts);
 if(b.dataset.askSingle)answer(ts,{option:c.options[Number(b.dataset.option)]?.t});
 else {const root=b.closest('[data-ask-card]');answer(ts,{options:[...root.querySelectorAll('input:checked')].map(i=>c.options[Number(i.dataset.askOption)].t)});}
});
$('message-input')?.addEventListener('input',()=>lastTyped=Date.now());
window.addEventListener('chat-message-added',e=>{const m=e.detail;if(sid&&m&&!m.askInteraction&&['check-in','survey-invitation','cinema-invite','red-envelope','gift','wish'].includes(m.type))A.markGate();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&sid){const c=A.flushPops();if(c&&!busy()&&Date.now()-c.ts<=4000&&window._isAwayFromChat?.())open(c.ts);A.tick();}});
function boot(){
 if(typeof SESSION_ID==='undefined'||!SESSION_ID||typeof messages==='undefined'||!$('cs-panel-chat')||!window.musicTogetherBridge)return;
 if(sid===SESSION_ID)return;
 sid=SESSION_ID;clearTimeout(timer);clearInterval(interval);A.stop();A.flushPops();
 document.querySelectorAll('.ta-ask-dialog').forEach(d=>d.remove());
 A.init({partnerId:()=>sid,onAskCard:onAsk,customCards:pool,chatStyleReply:pick,isNight:()=>false,
 onChatOut:t=>put('ta-ask-out-'+answeringTs,esc(t),'user','ta-ask-answer'),
 onChatIn:t=>put('ta-ask-in-'+answeringTs,esc(t),name(),'ta-ask-reply'),
 onAnswered:r=>{const c=A._load().cards[r.ts];if(c)refresh(c);}});
 const key='CHAT_APP_V3_askBank_'+sid;
 if(!localStorage.getItem(key)){A.importBank(window.MOCHI_ASK_QUESTIONS);localStorage.setItem(key,'1');}
 if(!$('ta-ask-entry')){const b=btn('TA 主动询问 · 题库与记录',settingsView);b.id='ta-ask-entry';b.className='setting-pill-row';$('cs-panel-chat').append(b);}
 Object.values(A._load().cards).forEach(c=>{if(!messages.some(m=>String(m.id)==='ta-ask-'+c.ts))put('ta-ask-'+c.ts,markup(c),name(),'ta-ask');else refresh(c);});
 timer=setTimeout(()=>{A.tick();interval=setInterval(()=>{boot();A.tick();},A.config.TICK_MS);},A.config.FIRST_MS);
}
setInterval(boot,1000);boot();
})();
