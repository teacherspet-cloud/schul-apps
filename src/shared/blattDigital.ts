/**
 * Digitale Fassung eines freigegebenen Arbeitsblatts (03.10.2026, Wunsch der Lehrkraft):
 * „Bei Linien zum Schreiben, die auf der nächsten Seite fortgesetzt werden, wird der getippte
 * Text nicht fortgeführt … Die Linien auf der nächsten Seite für die Fortsetzung der Aufgabe sind
 * für die digitale Version nicht nötig."
 *
 *  - Seiten wachsen mit (keine feste A4-Höhe mehr).
 *  - Folgestücke geteilter Aufgaben („Aufgabe 3 (Fortsetzung)") werden an das erste Stück
 *    angehängt; leer gewordene Seiten fallen weg.
 *  - `linienAnhaengen` fügt einem Schreibbereich weitere Linien hinzu, wenn der Text mehr braucht.
 *
 * Läuft im Browser der Lernenden (auf dem iframe-Dokument) UND auf dem Server (Chromium, für die
 * Seitenbilder an die KI) – deshalb ohne Importe und Hilfsfunktionen von außen: Der Server
 * übergibt den Quelltext der Funktion an `page.evaluate`.
 */
export function digitalisieren(doc: Document): number {
  if (doc.documentElement.hasAttribute('data-digital')) return 0
  doc.documentElement.setAttribute('data-digital', '')
  const stil = doc.createElement('style')
  stil.textContent =
    '.ws-page{height:auto !important;min-height:297mm;overflow:visible !important;display:flow-root}' +
    '.ws-body{overflow:visible !important}' +
    '.ws-content{position:relative !important;left:auto !important;right:auto !important;top:auto !important;bottom:auto !important}'
  doc.head.appendChild(stil)
  /*
   * Die Inhaltsfläche steht im Druck absolut zwischen festen Rändern (A4-Höhe) und schneidet ab, was
   * darüber hinausgeht – zusätzliche Linien wären unsichtbar, der Text liefe über Fuß und Kopf der
   * nächsten Seite (Befund der Lehrkraft, 03.10.2026). Digital: Ränder als Außenabstand, Fläche wächst.
   */
  doc.querySelectorAll('.ws-content').forEach((c) => {
    const st = (c as HTMLElement).style
    const oben = st.top || '0mm'
    const unten = st.bottom || '0mm'
    st.margin = oben + ' ' + (st.right || '0mm') + ' ' + unten + ' ' + (st.left || '0mm')
    st.minHeight = 'calc(297mm - ' + oben + ' - ' + unten + ')'
  })
  let verschoben = 0
  const aufgaben = Array.from(doc.querySelectorAll('.ws-task'))
  let erstes: Element | null = null
  for (const t of aufgaben) {
    if (!t.classList.contains('ws-continued')) {
      erstes = t
      continue
    }
    if (!erstes) continue
    const kinder = Array.from(t.children).filter((k) => !k.classList.contains('ws-task-continued') && !k.classList.contains('ws-phase'))
    for (const k of kinder) {
      const linien = erstes.querySelectorAll(':scope > .ws-lines, :scope .ws-lines')
      const letzte = linien.length ? linien[linien.length - 1] : null
      if (k.classList.contains('ws-lines') && letzte && letzte.parentElement) {
        letzte.parentElement.insertBefore(k, letzte.nextSibling)
      } else erstes.appendChild(k)
      verschoben++
    }
    // Hülle des Folgestücks (data-fluss/data-fortsetzung) mit entfernen, wenn sie dann leer ist
    const huelle = t.parentElement
    t.remove()
    if (huelle && huelle.hasAttribute('data-fortsetzung') && !huelle.children.length) huelle.remove()
  }
  // Originallinien nummerieren (Anker für zusätzliche Linien)
  doc.querySelectorAll('.ws-line').forEach((l, i) => l.setAttribute('data-li', String(i)))
  // Seiten ohne Inhalt (nur Kopf/Fuß) entfernen – außer der ersten
  const seiten = Array.from(doc.querySelectorAll('.ws-page'))
  seiten.forEach((s, i) => {
    if (i > 0 && !s.querySelector('.ws-block, .ws-task, .ws-text, .ws-material, img, table')) s.remove()
  })
  return verschoben
}

/**
 * Zusätzliche Linien (wenn der getippte Text mehr Platz braucht): je Originallinie (`data-li`, beim
 * Digitalisieren vergeben) die Zahl angehängter Linien. Wiederholt aufrufbar – fehlende werden
 * ergänzt. Auf dem Server mit denselben Angaben, damit Stift und Kästchen an derselben Stelle liegen.
 */
export function zusatzLinien(doc: Document, zusatz: Record<string, number>): void {
  // Ab 03.10.2026 zählt jede zusätzliche Linie einzeln (Kennzeichen „e"); ältere Stände hängten je
  // Schritt den ganzen Linienblock an und werden weiter so gelesen
  const einzeln = Boolean(zusatz.e)
  for (const [anker, anzahl] of Object.entries(zusatz)) {
    if (anker === 'e') continue
    const linie = doc.querySelector('[data-li="' + Number(anker) + '"]')
    if (!linie) continue
    const block = linie.closest('.ws-lines')
    const huelle = einzeln && block && block.querySelectorAll('.ws-line').length > 1 ? linie : block || linie
    let nach: Element = huelle
    let schon = 0
    while (nach.nextElementSibling && nach.nextElementSibling.hasAttribute('data-digital-linie')) {
      nach = nach.nextElementSibling
      schon++
    }
    for (let i = schon; i < Math.min(60, Number(anzahl) || 0); i++) {
      const neu = huelle.cloneNode(true) as Element
      neu.removeAttribute('data-bindet')
      neu.setAttribute('data-digital-linie', '')
      neu.querySelectorAll('[data-li]').forEach((x) => x.removeAttribute('data-li'))
      if (neu.hasAttribute('data-li')) neu.removeAttribute('data-li')
      if (nach.parentElement) nach.parentElement.insertBefore(neu, nach.nextSibling)
      nach = neu
    }
  }
}
