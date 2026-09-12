// sw.js
// Este archivo corre en segundo plano en el navegador (no en la app misma), y es lo
// que permite que llegue una notificación aunque Aienda esté cerrada.

self.addEventListener('push', function(event){
  let data = {};
  try{ data = event.data.json(); }
  catch(e){ data = { title:'Aienda', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Aienda';
  const options = {
    body: data.body || '',
    icon: 'icon-180.png',
    badge: 'icon-32.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
