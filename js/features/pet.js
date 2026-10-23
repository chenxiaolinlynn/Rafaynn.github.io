/* 可颂：花园骨架 MVP，逐格离线代管；基于言序作品修改。 */
(() => {
'use strict';
const menu=document.getElementById('chat-tools-menu');if(!menu)return;
const entry=document.createElement('button');entry.className='input-btn';entry.title='一起养';entry.setAttribute('aria-label','一起养可颂');entry.innerHTML='<i class="fas fa-paw"></i>';menu.append(entry);
const style=document.createElement('style');style.textContent=`
#pet-room{margin:auto;padding:0;width:min(520px,calc(100vw - 24px));height:min(840px,90dvh);border:1px solid var(--border-color);border-radius:26px;background:var(--secondary-bg,#fff);color:var(--text-primary);overflow:auto}
#pet-room *{box-sizing:border-box}#pet-room header{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;position:sticky;top:0;background:var(--secondary-bg,#fff);z-index:2}
#pet-room h2{font-size:19px;margin:0}#pet-room button{font:inherit;border:0;border-radius:14px;padding:10px;background:rgba(var(--accent-color-rgb),.12);color:var(--text-primary);cursor:pointer}
#pet-room::backdrop{background:#0005;backdrop-filter:blur(4px)}.pet-home{margin:0 16px;border-radius:22px;background:#faf6ee;text-align:center;overflow:hidden;position:relative}
.pet-home img{height:280px;max-width:100%;object-fit:contain;mix-blend-mode:multiply;transform-origin:50% 85%}
.pet-home img.pet-bounce{animation:pet-wiggle .65s ease}.pet-home p{margin:0;padding:8px 12px 16px;color:#866b4c;font-size:13px}
@keyframes pet-wiggle{25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
.pet-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:16px}.pet-stats label{font-size:12px;color:var(--text-secondary)}.pet-stats progress{width:100%;height:7px;accent-color:#c4a17a;display:block;margin-top:6px}
.pet-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 16px 16px}.pet-actions button{min-height:48px;font-size:13px!important}
.pet-details{margin:0 16px 18px;border-top:1px solid var(--border-color);padding-top:14px;font-size:13px}.pet-details summary{cursor:pointer}.pet-log{list-style:none;padding:0;margin-top:12px}.pet-log li{padding:10px 0;border-bottom:1px solid var(--border-color);line-height:1.6}.pet-log time{display:block;color:var(--text-secondary);font-size:11px}
.pet-note{font-size:11px;color:var(--text-secondary);line-height:1.7;margin:12px 16px 18px}
@media(max-width:480px){.pet-home img{height:240px}}
`;document.head.append(style);
const room=document.createElement('dialog');room.id='pet-room';room.setAttribute('aria-label','可颂的小房间');
room.innerHTML=`<header><h2>可颂的小房间</h2><button data-close aria-label="关闭宠物房间">×</button></header><div class="pet-home"><img src="assets/kesong.svg" alt="焦糖卷毛小狗可颂"><p role="status" id="pet-status">今天也一起照顾可颂吧</p></div><p class="pet-note" id="pet-progress"></p><div class="pet-stats"></div><div class="pet-actions"></div><details class="pet-details"><summary>共同照顾记录</summary><p id="pet-ranking"></p><ul class="pet-log"></ul></details><details class="pet-details"><summary>照顾设置</summary><label><input id="pet-auto" type="checkbox"> 允许对方主动照顾可颂</label><p>每 30 分钟一格，10% 概率代管；离线回来按时间顺序补算，单次最多 40 格，超出的旧格子不积压。进入房间另有 30% 概率照顾，夜间也可以照顾</p><p>点击「让对方照顾」无需概率，仍遵守宠物状态和动作冷却</p></details><p class="pet-note">照顾免费，不扣心愿币。可颂不会因离线死亡；状态按真实时间衰减，长期见底可能生病，完成护理即可恢复。数据保存在当前浏览器，手机与电脑暂不同步。</p>`;
document.body.append(room);
const scope=()=>typeof SESSION_ID!=='undefined'?String(SESSION_ID):'default';
const key=()=> 'CHAT_APP_V3_pet_kesong_'+scope();
const partner=()=>typeof settings!=='undefined'?settings.partnerName||'祁煜':'祁煜';
const specs={feed:['🍽 喂食','吃得饱饱的，舔了舔嘴巴'],pet:['♡ 摸摸','眯起眼睛，往你手心蹭了蹭'],play:['⚾ 玩球','叼着球跑回来了'],clean:['🫧 清洁','变得干净又蓬松'],sleep:['☾ 睡觉','窝好准备休息了'],wake:['☀ 叫醒','伸了个懒腰，醒来了']};
// 基于言序作品修改：按用户提供的花园骨架设计独立实现，固定为可颂一只狗。
const H=3600000, clamp=n=>Math.max(0,Math.min(100,n));
const cooldown={feed:2*H,play:H/2,clean:6*H,pet:H/6,sleep:0,wake:0};
const dateKey=t=>{const d=new Date(t);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;};
function fresh(now){return {version:2,food:80,mood:80,energy:90,clean:90,at:now,bornAt:now,growthCut:0,exp:0,intimacy:{me:0,ta:0},st:{me:{},ta:{}},auto:true,log:[],last:{},lpc:now,sleeping:null,zero:{},sick:false,cure:{},daily:{day:dateKey(now),feed:0,play:0,rest:0,done:false},streak:0,lastCareDay:'',adult:false};}
function read(){let s;try{s=JSON.parse(localStorage.getItem(key()));}catch{}if(s?.version===2)return s;
const n=fresh(Date.now());if(s?.version===1){for(const k of ['food','mood','energy','clean','auto'])if(s[k]!==undefined)n[k]=s[k];n.log=(s.log||[]).slice(0,300);n.log.unshift({at:n.at,text:'已升级养成系统，保留原有状态和照顾记录；从今天开始记录年龄'});}return n;}
function record(s,text,t){s.log.unshift({at:t,text});s.log=s.log.slice(0,300);}
function advance(s,to=Date.now()){
// 分钟步长同时处理夜间、睡醒、恢复期和连续见底；超过长期离线部分直接稳定为零。
if(to<=s.at)return s;
while(s.at<to){let end=Math.min(to,s.at+60000);if(s.sleeping)end=Math.min(end,s.sleeping.until);if(end<=s.at){s.sleeping=null;continue;}
const h=(end-s.at)/H,night=new Date(s.at).getHours()>=23||new Date(s.at).getHours()<7,rest=!!s.sleeping,rate=s.recoverUntil>s.at?.5:1;
s.food=clamp(s.food-5*h*rate*(rest?.5:night?.7:1));s.mood=clamp(s.mood-(rest||night?0:100/36*1.3*h*rate*(s.food<20?1.5:1)));s.clean=clamp(s.clean-(rest?0:100/48*h*rate));s.energy=clamp(s.energy+(rest?12.5:-6.25*rate)*h);
for(const k of ['food','mood','clean','energy']){if(s[k]===0){s.zero[k]??=end;if(end-s.zero[k]>=12*H&&!s.sick){s.sick=true;s.cure={};record(s,'可颂有些不舒服，需要喂药、洗澡和喂食',end);}}else delete s.zero[k];}
s.at=end;
if(s.sleeping&&(end>=s.sleeping.until||s.energy>=100)){s.sleeping=null;s.mood=clamp(s.mood+10);record(s,'可颂睡醒了，伸了个懒腰',end);}
if(s.bathAt&&end>=s.bathAt+H){s.mood=clamp(s.mood+10);s.bathAt=0;}
// 极长离线最多模拟 32 天；全零且生病时剩余时间不会改变状态。
if(s.sick&&!s.sleeping&&['food','mood','clean','energy'].every(k=>s[k]===0))s.at=to;
}return s;}
function level(s){return Math.floor(Math.sqrt(s.exp/10))+1;}
function age(s){return (s.at-s.bornAt+s.growthCut)*(1+Math.min((s.intimacy.me+s.intimacy.ta)/2000,.3))*(level(s)>=12?1.6:level(s)>=5?1.3:1)*(s.sick?.85:1);}
function milestones(s){if(!s.adult&&age(s)>=60*H){s.adult=true;s.adultAt=s.at;s.exp+=30;record(s,'可颂成年啦 · 获得 30 经验',s.at);}}
function apply(s,a,ta=false,t=s.at,random=Math.random){
advance(s,t);if(s.sleeping&&a!=='wake')return '可颂睡着啦，先让它好好休息';
if(t-(s.last[a]??-Infinity)<(cooldown[a]||0))return '刚刚照顾过啦，这个动作还在冷却中';
if(a==='sleep'&&s.energy>=100)return '可颂精力充沛，暂时不困';
if(a==='medicine'&&!s.sick)return '可颂现在很健康';
const factor=(ta?.8:1)*(s.sick?.5:1),lowMood=s.mood<20,lowClean=s.clean<20;let xp={feed:6,play:8,clean:6,sleep:4,pet:1,wake:0,medicine:0}[a]||0;
if(a==='feed'){s.food=clamp(s.food+35*factor*(s.food>90?.5:1));s.cure.feed=true;}
if(a==='play'){s.mood=clamp(s.mood+25*1.3*factor*(s.energy<15?.5:1));s.energy=clamp(s.energy-10*factor);s.clean=clamp(s.clean-5*factor);}
if(a==='clean'){s.clean=clamp(s.clean+(100-s.clean)*factor);s.mood=clamp(s.mood-5*factor);s.bathAt=t;s.cure.clean=true;}
if(a==='pet')s.mood=clamp(s.mood+8*factor*(lowClean?.5:1));
if(a==='sleep')s.sleeping={until:t+Math.min(2,(100-s.energy)/12.5)*H};
if(a==='wake')s.sleeping=null;
if(a==='medicine')s.cure.medicine=true; // MVP 提供免费基础护理，后续再接市集药品库存。
let quality='';if(a==='feed'||a==='play'){const r=random();if(r<.05){xp*=2;quality=' · 大惊喜';}else if(r<.3){xp*=1.5;s.mood=clamp(s.mood+10);quality=' · 特别开心';}}
s.exp+=xp*(s.sick?.5:1);const side=ta?'ta':'me';s.intimacy[side]+=(ta?1:['feed','play'].includes(a)?2:1)*(lowMood?.5:1);
s.st[side][a]=(s.st[side][a]||0)+1;s.last[a]=t;
record(s,(ta?partner():'我')+'照顾可颂 · '+(specs[a]?.[0]||'喂药')+quality,t);
if(!ta&&a!=='wake'){
const day=dateKey(t);if(s.daily.day!==day)s.daily={day,feed:0,play:0,rest:0,done:false};
if(s.lastCareDay!==day){const yesterday=dateKey(t-24*H);s.streak=s.lastCareDay===yesterday?s.streak+1:1;s.lastCareDay=day;s.exp+=10+s.streak;}
if(a==='feed'||a==='play')s.daily[a]++;if(a==='clean'||a==='sleep')s.daily.rest++;
if(!s.daily.done&&s.daily.feed>=2&&s.daily.play>=2&&s.daily.rest>=1){s.daily.done=true;s.exp+=50;record(s,'完成今日照顾任务 · +50 经验',t);}
if(random()<.08){s.intimacy.me+=(['feed','play'].includes(a)?2:1)*(lowMood?.5:1);record(s,partner()+'也来一起照顾，本次亲密收益翻倍',t);}}
if(s.sick&&s.cure.feed&&s.cure.clean&&s.cure.medicine){s.sick=false;s.zero={};s.recoverUntil=t+24*H;record(s,'可颂康复啦，接下来 24 小时慢慢恢复',t);}
milestones(s);return '';}
function partnerAct(s,t,random=Math.random){advance(s,t);if(s.sleeping)return false;let a;
if(s.food<25)a='feed';else if(s.clean<20)a='clean';else if(s.sick&&!s.cure.medicine)a='medicine';else if(s.energy<15)a='sleep';else {const r=random();a=r<.2?'feed':r<.45?'play':r<.57?'clean':r<.67?'sleep':r<.9?'pet':null;}
if(!a)return false;
if((a==='feed'&&s.food>=100)||t-(s.last[a]??-Infinity)<(cooldown[a]||0))a='pet';
if(apply(s,a,true,t,random))return false;
if(random()<.4)record(s,partner()+'：宝宝，可颂这边有我照顾呢',t);return true;}
function settle(s,now=Date.now(),random=Math.random){
const slots=Math.floor(Math.max(0,now-s.lpc)/(H/2));const start=s.lpc;let count=0;
for(let i=0;i<Math.min(slots,40);i++){const t=start+(i+1)*H/2;advance(s,t);if(s.auto&&random()<.1&&partnerAct(s,t,random))count++;}
// 超过 20 小时的格子不积压，避免反复打开补刷照顾。
s.lpc=start+slots*(H/2);advance(s,now);milestones(s);if(count)record(s,partner()+'后台照顾了可颂 '+count+' 次',now);return s;}
function save(s){try{localStorage.setItem(key(),JSON.stringify(s));return true;}catch{tell('存储空间不足，照顾记录未保存');return false;}}
function tell(t){room.querySelector('#pet-status').textContent=t;}
function load(){const s=settle(read());save(s);return s;}
function render(s=load()){const stats=room.querySelector('.pet-stats');stats.replaceChildren();for(const [k,label] of [['food','饱腹'],['mood','心情'],['energy','精力'],['clean','清洁']]){const l=document.createElement('label');l.textContent=label+' · '+Math.round(s[k]);const p=document.createElement('progress');p.max=100;p.value=s[k];p.setAttribute('aria-label',label);l.append(p);stats.append(l);}
const actions=room.querySelector('.pet-actions');actions.replaceChildren();for(const a of ['feed','pet','play','clean',s.sleeping?'wake':'sleep',...(s.sick?['medicine']:[])]){const b=document.createElement('button');b.textContent=specs[a]?.[0]||'♡ 基础护理';b.onclick=()=>care(a);actions.append(b);}
const ask=document.createElement('button');ask.textContent='让'+partner()+'照顾';ask.onclick=()=>{const s=load();const ok=s.sleeping?false:(partnerAct(s,s.at)||!apply(s,'pet',true,s.at));save(s);render(s);if(!ok)tell('可颂正在休息，或照顾动作还在冷却中');};actions.append(ask);
room.querySelector('#pet-auto').checked=s.auto;const log=room.querySelector('.pet-log');log.replaceChildren();for(const item of s.log){const li=document.createElement('li'),t=document.createElement('time');li.textContent=item.text;t.textContent=new Date(item.at).toLocaleString();li.append(t);log.append(li);}
room.querySelector('#pet-progress').textContent=`${age(s)>=60*H?'成年':age(s)>=12*H?'幼年':'幼崽'} · Lv.${level(s)} · 经验 ${s.exp.toFixed(1)} · 连续照顾 ${s.streak} 天`;
room.querySelector('#pet-ranking').textContent=['feed','play','clean','sleep'].map((a,i)=>`${['喂食','陪玩','洗澡','哄睡'][i]}：我 ${s.st.me[a]||0} / ${partner()} ${s.st.ta[a]||0}`).join(' ｜ ');
tell(s.sick?'可颂不舒服，需要基础护理、洗澡和喂食':s.sleeping?'可颂正在睡觉，睡满或精力恢复后自动醒来':'可颂正抬头看着你，等你摸摸它');}
function care(a){const s=load(),error=apply(s,a);if(!save(s))return;render(s);if(error)tell(error);}
entry.onclick=()=>{const s=load();if(s.auto&&Math.random()<.3)partnerAct(s,s.at);save(s);render(s);room.showModal();};room.querySelector('[data-close]').onclick=()=>room.close();
room.querySelector('#pet-auto').onchange=e=>{const s=load();s.auto=e.target.checked;save(s);};
window.addEventListener('chat-message-added',()=>{load();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){const s=load();if(room.open)render(s);}});
setInterval(()=>{if(room.open&&!document.hidden)render();},60000);
window.addEventListener('storage',e=>{if(e.key===key()&&room.open)render();});
})();
