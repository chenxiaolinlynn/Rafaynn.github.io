/* 可颂：本地养宠，不扣钱包。计时按时间戳恢复；离线不补发照顾消息。 */
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
room.innerHTML=`<header><h2>可颂的小房间</h2><button data-close aria-label="关闭宠物房间">×</button></header><div class="pet-home"><img src="assets/kesong.svg" alt="焦糖卷毛小狗可颂"><p role="status" id="pet-status">今天也一起照顾可颂吧</p></div><div class="pet-stats"></div><div class="pet-actions"></div><details class="pet-details"><summary>共同照顾记录</summary><ul class="pet-log"></ul></details><details class="pet-details"><summary>照顾设置</summary><label><input id="pet-auto" type="checkbox"> 允许对方照顾可颂</label><p>每轮普通聊天后有 10% 概率照顾，间隔至少 30 分钟，每天最多 3 次，仅记在照顾记录里</p></details><p class="pet-note">照顾免费，不扣心愿币。可颂不会因离线死亡；状态最多下降至 25。数据保存在当前浏览器，手机与电脑暂不同步。</p>`;
document.body.append(room);
const scope=()=>typeof SESSION_ID!=='undefined'?String(SESSION_ID):'default';
const key=()=> 'CHAT_APP_V3_pet_kesong_'+scope();
const partner=()=>typeof settings!=='undefined'?settings.partnerName||'祁煜':'祁煜';
const specs={feed:['🍽 喂食','吃得饱饱的，舔了舔嘴巴'],pet:['♡ 摸摸','眯起眼睛，往你手心蹭了蹭'],play:['⚾ 玩球','叼着球跑回来了'],clean:['🫧 清洁','变得干净又蓬松'],sleep:['☾ 睡觉','窝好准备休息了'],wake:['☀ 叫醒','伸了个懒腰，醒来了']};
const clamp=n=>Math.max(25,Math.min(100,n));
function read(){let s;try{s=JSON.parse(localStorage.getItem(key()));}catch{}if(!s||s.version!==1)s={version:1,food:80,mood:80,energy:80,clean:80,at:Date.now(),sleeping:false,auto:true,log:[],last:{},day:'',count:0,partnerAt:0};return s;}
function advance(s){const h=Math.max(0,Date.now()-s.at)/3600000;s.food=clamp(s.food-Math.min(h,24)*2);s.mood=clamp(s.mood-Math.min(h,24));s.clean=clamp(s.clean-Math.min(h,24));s.energy=clamp(s.energy+(s.sleeping?12:-2)*Math.min(h,24));s.at=Date.now();return s;}
function save(s){try{localStorage.setItem(key(),JSON.stringify(s));return true;}catch{tell('存储空间不足，照顾记录未保存');return false;}}
function tell(t){room.querySelector('#pet-status').textContent=t;}
function render(){const s=advance(read());const stats=room.querySelector('.pet-stats');stats.replaceChildren();for(const [k,label] of [['food','饱腹'],['mood','心情'],['energy','精力'],['clean','清洁']]){const l=document.createElement('label');l.textContent=label+' · '+Math.round(s[k]);const p=document.createElement('progress');p.max=100;p.value=s[k];p.setAttribute('aria-label',label);l.append(p);stats.append(l);}
const actions=room.querySelector('.pet-actions');actions.replaceChildren();for(const action of ['feed','pet','play','clean',s.sleeping?'wake':'sleep']){const b=document.createElement('button');b.textContent=specs[action][0];b.onclick=()=>care(action,'我');actions.append(b);}
room.querySelector('#pet-auto').checked=s.auto;const log=room.querySelector('.pet-log');log.replaceChildren();for(const item of s.log){const li=document.createElement('li'),t=document.createElement('time');li.textContent=item.text;t.textContent=new Date(item.at).toLocaleString();li.append(t);log.append(li);}if(!s.log.length)log.textContent='还没有记录，摸摸可颂开始吧';
tell(s.sleeping?'可颂正在睡觉，精力会慢慢恢复':'可颂正抬头看着你，等你摸摸它');}
function care(action,who,automated=false){const s=advance(read()),now=Date.now(),day=new Date().toLocaleDateString();if(automated&&(!s.auto||now-s.partnerAt<1800000||(s.day===day&&s.count>=3)))return;
if(s.sleeping&&action!=='wake'){if(!automated)tell('可颂在睡觉，先让它休息吧');return;}
if(now-(s.last[action]||0)<(action==='pet'?10000:60000)){if(!automated)tell('刚刚照顾过啦，等一会儿再来');return;}
if(action==='feed'&&s.food>=95){if(!automated)tell('可颂已经吃饱啦');return;}
if(action==='play'&&s.energy<35){if(!automated)tell('可颂有点累，先休息一下吧');return;}
if(action==='feed')s.food=clamp(s.food+20);
if(action==='pet')s.mood=clamp(s.mood+12);
if(action==='play'){s.mood=clamp(s.mood+20);s.energy=clamp(s.energy-12);s.food=clamp(s.food-5);}
if(action==='clean')s.clean=clamp(s.clean+25);
if(action==='sleep')s.sleeping=true;if(action==='wake')s.sleeping=false;
s.last[action]=now;if(automated){s.count=(s.day===day?s.count:0)+1;s.day=day;s.partnerAt=now;}
s.log.unshift({at:now,text:who+'照顾了可颂 · '+specs[action][0].split(' ').slice(1).join(' ')});s.log=s.log.slice(0,100);
if(!save(s))return;if(room.open){render();tell('可颂'+specs[action][1]);const img=room.querySelector('img');img.classList.remove('pet-bounce');void img.offsetWidth;img.classList.add('pet-bounce');}}
entry.onclick=()=>{render();room.showModal();};room.querySelector('[data-close]').onclick=()=>room.close();
room.querySelector('#pet-auto').onchange=e=>{const s=advance(read());s.auto=e.target.checked;save(s);};
window.addEventListener('chat-message-added',e=>{const m=e.detail;if(!m||m.type!=='normal'||m.sender==='user'||m.sender==='system'||m.musicInteraction||document.hidden)return;const s=advance(read());if(!s.auto||s.sleeping||Date.now()-s.partnerAt<1800000||Math.random()>=.1)return;const pool=['pet'];if(s.food<85)pool.push('feed');if(s.clean<85)pool.push('clean');if(s.energy>=45)pool.push('play');else pool.push('sleep');care(pool[Math.floor(Math.random()*pool.length)],partner(),true);});
setInterval(()=>{if(room.open&&!document.hidden)render();},60000);
window.addEventListener('storage',e=>{if(e.key===key()&&room.open)render();});
})();
