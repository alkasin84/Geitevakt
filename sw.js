self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  event.waitUntil(self.registration.showNotification(data.title||'Geitevakt',{
    body:data.body||'Åpne Geitevakt for å sjekke dagens besøk.',
    icon:'./icon-192.png',badge:'./icon-192.png',tag:data.tag||'geitevakt',
    data:{url:new URL('./',self.registration.scope).href}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL('./',self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const existing=clients.find(c=>c.url.startsWith(url));
    if(existing) return existing.focus();
    return self.clients.openWindow(url);
  }));
});
