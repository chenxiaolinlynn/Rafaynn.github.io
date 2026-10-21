/* Notification display/click only: does not cache pages, chat data, or schedule messages. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const fallback=self.registration.scope;let url;
  try{url=new URL(event.notification.data?.url||fallback);if(url.origin!==self.location.origin||!url.href.startsWith(fallback))url=new URL(fallback);}catch{url=new URL(fallback);}
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const exact=windows.find(w=>w.url===url.href);if(exact)return exact.focus();
  return self.clients.openWindow(url.href);
 })());
});
