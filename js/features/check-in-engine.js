/* Single-partner check-ins: deterministic state transitions, no AI or server. */
(function(root) {
'use strict';
const defaults={enabled:false,chance:8,cooldown:30,autoOpen:70,away:true,frequency:'quiet',night:true};
const frequencies={quiet:[1,180],standard:[2,30],quieter:[.5,360],quietest:[.2,720]};
const questions=[
 {id:'doing',type:'single',enabled:true,text:'宝宝在干嘛呢？',options:[{t:'在想你',reply:['我也想你了宝宝','亲亲宝宝']},{t:'在忙呢',reply:['好呀宝宝，忙完来找我','宝宝辛苦啦，我等你']},{t:'在休息',reply:['陪宝宝一起休息','宝宝要好好放松呀']}]},
 {id:'meal',type:'single',enabled:true,text:'宝宝吃饭了吗？',options:[{t:'吃过啦',reply:['宝宝真乖','那我就放心啦宝宝']},{t:'还没吃',reply:['宝宝记得吃饭呀','想陪宝宝一起吃']} ]},
 {id:'mood',type:'single',enabled:true,text:'宝宝今天心情怎么样？',options:[]},
 {id:'hug',type:'action',enabled:true,text:'过来抱抱',toMe:'宝宝，让我抱抱你好不好？',toTa:'宝宝，过来抱抱我好不好？',accept:['抱紧宝宝','亲亲宝宝'],reject:['好呀，等宝宝想抱的时候再抱','那我先陪着宝宝']}
];
const replies=['知道啦宝宝','想你了宝宝！','爱你宝宝','亲亲宝宝'];
function create({storage,key,now=Date.now,random=Math.random,id=()=>String(now())+'-'+random()}) {
 let data;
 try { data=JSON.parse(storage.getItem(key)||'null'); } catch {}
 data=Object.assign({config:{...defaults},questions:JSON.parse(JSON.stringify(questions)),replies:[...replies],records:[],lastAt:0,lastAway:0,lastQuestion:null},data||{});
 data.config={...defaults,...data.config};
 const pick=a=>a[Math.floor(random()*a.length)];
 const save=()=>storage.setItem(key,JSON.stringify(data));
 const pending=()=>data.records.find(r=>r.status==='pending');
 function clean(){ const before=JSON.stringify(data.records),at=now();for(const r of data.records)if(r.status==='pending'&&at-r.at>=86400000){r.status='missed';r.doneAt=at;}data.records=data.records.filter(r=>r.status==='pending'||at-(r.doneAt||r.at)<86400000).slice(-20);const changed=before!==JSON.stringify(data.records);if(changed)save();return changed; }
 const normalize=s=>String(s).replace(/[\s，。？！、,.!?～~]/g,'').toLowerCase();
 const similar=(a,b)=>{a=normalize(a);b=normalize(b);return a===b||(Math.min(a.length,b.length)>=4&&(a.includes(b)||b.includes(a)));};
 function draw(away=false,recent=[]) {
  let pool=data.questions.filter(q=>q.enabled&&q.text.trim()&&q.id!==data.lastQuestion);
  // With only one enabled question, wait rather than repeat it immediately.
  const chosen=pick(pool);
  if(away&&chosen&&[...recent,...data.records.filter(r=>now()-r.at<3600000).map(r=>r.question.text)].some(t=>similar(t,chosen.text)))return null;
  return chosen;
 }
 function issue({away=false,force=false,recent=[],frequency=data.config.frequency}={}) {
  clean();const c=data.config,[chance,minutes]=frequencies[frequency]||frequencies.quiet;
  if(pending()||!c.enabled||away&&!c.away)return null;
  if(!force&&(now()-(away?Math.max(data.lastAway,data.lastAt):data.lastAt)<(away?minutes:c.cooldown)*60000||random()*100>=(away?chance:c.chance)))return null;
  const question=draw(away,recent);if(!question)return null;
  const r={id:id(),at:now(),status:'pending',away,direction:away&&random()<.5?'meToTa':'toMe',actionDirection:random()<.5?'toMe':'toTa',question:JSON.parse(JSON.stringify(question)),delivered:false,notified:false};
  data.lastAt=now();if(away)data.lastAway=now();data.lastQuestion=question.id;data.records.push(r);save();return r;
 }
 function answer(recordId,value,reverseQuestionId) {
  clean();const r=data.records.find(r=>r.id===recordId);if(!r||r.status!=='pending')return null;
  let pool,answerText;
  if(r.direction==='meToTa') {
   if(value==='reject'){answerText='不要';pool=['好呀宝宝，等你想问的时候再来找我'];}
   else {const q=data.questions.find(q=>q.enabled&&q.id===reverseQuestionId);if(!q)throw Error('请选择想问的问题');r.reverseQuestion=JSON.parse(JSON.stringify(q));answerText=q.text;
    if(q.type==='action')pool=q.accept;
    else if(q.options?.length){const option=pick(q.options);pool=[option.t];}
    else pool=data.replies;
   }
  } else if(r.question.type==='action') {
   if(!['accept','reject'].includes(value))throw Error('请选择好呀或不要');answerText=value==='accept'?'好呀':'不要';pool=r.question[value];
  } else if(r.question.options?.length) {
   const option=r.question.options[Number(value)];if(!option)throw Error('请选择一个选项');answerText=option.t;pool=option.reply;
  } else {answerText=String(value).trim().slice(0,500);if(!answerText)throw Error('先写下你的回答吧');pool=data.replies;}
  r.answer=answerText;r.reply=pick((pool||[]).filter(x=>String(x).trim()))||pick(data.replies)||'知道啦宝宝';r.status='answered';r.doneAt=now();r.replyAt=now()+400+random()*800;save();return r;
 }
 return {data,pick,save,pending,clean,issue,answer,similar};
}
root.CheckInEngine={create,defaults,frequencies};
})(typeof window==='undefined'?globalThis:window);
