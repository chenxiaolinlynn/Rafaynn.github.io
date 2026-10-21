/* Notifications while the page is running. No push subscription or background scheduler. */
(()=>{
'use strict';
const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>!!navigator.standalone||matchMedia('(display-mode: standalone)').matches;
const capability=()=>ios&&!standalone()?'install':!window.isSecureContext?'https':!('Notification'in window)?'unsupported':'ready';
let registration;
function worker(){
 if(!('serviceWorker'in navigator))return Promise.resolve(null);
 if(!registration)registration=navigator.serviceWorker.register(new URL('notification-sw.js',document.baseURI),{scope:'./'}).then(async r=>{
  if(r.active)return r;
  await new Promise((resolve,reject)=>{const w=r.installing||r.waiting;if(!w)return reject(Error('通知服务尚未就绪'));const timer=setTimeout(()=>reject(Error('通知服务启动超时，请重试')),12000);w.addEventListener('statechange',()=>{if(w.state==='activated'){clearTimeout(timer);resolve();}else if(w.state==='redundant'){clearTimeout(timer);reject(Error('通知服务启动失败'));}});});return r;
 }).catch(e=>{registration=null;throw e;});return registration;
}
const help={install:'苹果手机请先在 Safari 分享菜单中选择「添加到主屏幕」，再从主屏幕图标打开并开启通知（需要 iOS / iPadOS 16.4 或以上）',https:'请通过 HTTPS 网站开启通知，本地文件不支持',unsupported:'当前环境不支持通知；苹果手机请更新系统并从主屏幕打开网站'};
function status(text){const el=document.getElementById('notif-status-text');if(el)el.textContent=text;}
function refresh(){const toggle=document.getElementById('notif-permission-toggle'),kind=capability(),permission=kind==='ready'?Notification.permission:'default';const on=kind==='ready'&&permission==='granted'&&localStorage.getItem('notifEnabled')==='1';if(toggle)toggle.checked=on;
 status(help[kind]||(permission==='denied'?(ios?'通知已被关闭，请到系统「设置 → 通知」中找到主屏幕网页应用并允许通知':'通知权限被拒绝，请在浏览器的网站通知设置中允许；Mac 还需检查系统「通知 → Safari」'):on?'已开启：页面仍在运行时可提醒；锁屏、系统暂停或关闭网页后不保证送达':'未开启：仅支持页面运行期间的系统提醒，不是关闭网页后的远程推送'));
}
async function display(title,options){const r=await worker();if(r){await r.showNotification(title,options);return;}if(ios)throw Error('苹果手机需要通知服务，请刷新重试');new Notification(title,options);}
async function enable(){
 const kind=capability();if(kind!=='ready'){refresh();return {ok:false,message:help[kind]};}
 try{
  // Invoke permission immediately in the click handler, before awaiting service-worker setup.
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted'){localStorage.setItem('notifEnabled','0');refresh();return {ok:false,message:permission==='denied'?'通知权限未获允许，请查看设置中的引导':'尚未允许通知'};}
  await display('传讯通知已开启',{body:'页面运行期间可提醒；关闭网页后不会继续产生消息',tag:'notif-test',data:{url:new URL('./',document.baseURI).href}});
  localStorage.setItem('notifEnabled','1');refresh();return {ok:true,message:'通知已开启'};
 }catch(e){localStorage.setItem('notifEnabled','0');refresh();const message='通知未能开启：'+(e.message||'请刷新重试');status(message);return {ok:false,message};}
}
async function send(title,body,tag='partner-msg'){
 if(!document.hidden||localStorage.getItem('notifEnabled')!=='1'||capability()!=='ready'||Notification.permission!=='granted')return false;
 try{await display(title||'传讯',{body:body||'对方发来了消息',tag,data:{url:location.href}});return true;}catch(e){console.warn('系统通知发送失败',e);return false;}
}
window.SiteNotifications={enable,send,refresh};
window._sendPartnerNotification=send;
window.handleNotifToggle=async checkbox=>{if(!checkbox.checked){localStorage.setItem('notifEnabled','0');refresh();return;}checkbox.disabled=true;try{await enable();}finally{checkbox.disabled=false;}};
document.addEventListener('DOMContentLoaded',()=>{refresh();if(capability()==='ready')worker().catch(()=>{});});
window.addEventListener('focus',refresh);
document.addEventListener('click',e=>{if(e.target.closest?.('#data-settings'))refresh();});
})();
