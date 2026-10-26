/**
 * Lösung je Aufgabe (26.10.2026, Entscheidung der Lehrkraft: statt eines langen Lösungsblatts am Ende steht die
 * Musterlösung aufklappbar direkt an jeder Aufgabe). Das Lösungsblatt der Freigabe ist das ganze Blatt mit eingesetzten
 * Antworten (arbeitsblatt/render/printHtml `keyOnly`); hier wird es in die Aufgaben zerlegt – dieselbe Zählung wie beim
 * Messen des Schülerblatts (`.ws-task`, Fortsetzungen `.ws-continued` gehören zur vorigen Aufgabe) – und jeder Teil
 * wird mit den Stilen des Blatts zu einem kleinen eigenen Dokument für einen Rahmen ohne Skripte.
 */
export function loesungenJeAufgabe(html: string): Record<number, string> {
  if (typeof DOMParser === 'undefined') return {}
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const stile = [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')
  const teile: Record<number, string[]> = {}
  let nr = 0
  for (const task of doc.querySelectorAll('.ws-task')) {
    if (!task.classList.contains('ws-continued')) nr++
    if (!nr) continue
    ;(teile[nr] ??= []).push(task.outerHTML)
  }
  const kopf = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}\n${stile}\n.ws-page{width:auto!important;min-height:0!important;height:auto!important;padding:6px 10px!important;margin:0!important;box-shadow:none!important;overflow:visible!important}</style></head><body>`
  return Object.fromEntries(Object.entries(teile).map(([n, t]) => [n, `${kopf}<div class="ws-page">${t.join('')}</div></body></html>`]))
}
