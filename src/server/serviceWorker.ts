/**
 * Service Worker des Schülerbereichs (10.10.2026, Erinnerungen zum Üben – erinnerungen.ts), ausgeliefert unter
 * /s/sw.js mit dem Bereich „/s/". Er tut nur zwei Dinge: eine Push-Nachricht als Benachrichtigung zeigen und beim
 * Antippen die passende Seite öffnen. Kein Zwischenspeicher, kein Abfangen von Anfragen (die App lädt wie bisher).
 *
 * Die Nachricht kommt verschlüsselt (webPush.ts) und enthält nur Titel, Text, Ziel und Sprache – keine Namen.
 * iOS verlangt, dass jede Push-Nachricht sichtbar angezeigt wird; das geschieht hier immer.
 */
export const SERVICE_WORKER = `'use strict';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
function ziel(u) { return (typeof u === 'string' && /^\\/s\\/[\\w\\/-]*$/.test(u)) ? u : '/s/'; }
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { b: e.data ? e.data.text() : '' }; }
  var titel = (typeof d.t === 'string' && d.t) ? d.t.slice(0, 60) : 'Schul-Apps';
  e.waitUntil(self.registration.showNotification(titel, {
    body: typeof d.b === 'string' ? d.b.slice(0, 200) : '',
    icon: '/web-app/icon-192.png',
    badge: '/web-app/icon-192.png',
    tag: typeof d.tag === 'string' ? d.tag : 'sa-erinnerung',
    lang: d.l === 'en' ? 'en' : 'de',
    data: { u: ziel(d.u) }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL(ziel(e.notification.data && e.notification.data.u), self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (fenster) {
    for (var i = 0; i < fenster.length; i++) {
      var f = fenster[i];
      if (f.url.indexOf(self.location.origin + '/s/') === 0 && 'focus' in f) {
        return f.focus().then(function (g) { return g && 'navigate' in g ? g.navigate(url) : g; }).catch(function () { return self.clients.openWindow(url); });
      }
    }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('pushsubscriptionchange', function (e) {
  var alt = e.oldSubscription;
  if (!alt || !alt.options) return;
  e.waitUntil(self.registration.pushManager.subscribe(alt.options).then(function (neu) {
    return fetch('/s/api/erinnerungen/geraet', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-schulapps-token': 'server' },
      body: JSON.stringify({ abo: neu.toJSON(), alt: alt.endpoint }) });
  }).catch(function () {}));
});
`
