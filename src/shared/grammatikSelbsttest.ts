/**
 * Selbsttest einer Grammatikaufgabe ohne KI (28.10.2026, Wunsch der Lehrkraft: „Tests, die sicherstellen, dass die
 * Aufgaben lösbar und sinnvoll sind"): Die hinterlegte Lösung wird wie eine Antwort von Lernenden eingegeben und muss
 * als „richtig" gelten (je Format so, wie die App sie annimmt); falsche Möglichkeiten dürfen nicht als richtig gelten;
 * der Aufbau muss zum Format passen (Lücken, Möglichkeiten, Gruppen, Fehlerwort, Satzanfang …).
 * Läuft beim Erzeugen (aufgabeMangel) und als Prüfung der ganzen Bank (tests/grammatikBankSelbsttest.test.ts).
 */
import { blindUrteil, sortierFolge, type BlindAntwort } from './grammatikBlindprobe'
import { normiert, pruefeGrammatik, SATZ_ARTEN, satzanfang, woerterVon, type GrammatikAufgabe } from './grammatiktrainer'

const ohneKomma = (s: string): string => normiert(s).replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim()

/** Die vollständig richtige Antwort, wie Lernende sie geben würden */
export function musterAntwort(a: GrammatikAufgabe): BlindAntwort | null {
  const b: BlindAntwort = { nr: 1, text: '', liste: [], wort: '', richtig: false, auch: [] }
  switch (a.art) {
    case 'luecke':
    case 'auswahl':
    case 'umformen':
    case 'verbinden':
    case 'frage':
      return { ...b, text: a.loesungen[0] ?? '' }
    case 'satzbau':
      return { ...b, text: a.loesungen[0] || (a.teile ?? []).join(' ') }
    case 'mehrfach':
      return { ...b, liste: [...a.loesungen] }
    case 'lueckentext':
      return { ...b, liste: (a.luecken ?? []).map((l) => l.loesungen[0] ?? '') }
    case 'markieren': {
      const w = woerterVon(a.satz)
      return { ...b, liste: (a.ziele ?? []).map((i) => w[i] ?? '') }
    }
    case 'sortieren':
      return { ...b, liste: sortierFolge(a).map((i) => a.gruppen?.[a.elemente![i].gruppe] ?? '') }
    case 'zuordnen':
      return { ...b, liste: (a.paare ?? []).map((p) => p.rechts) }
    case 'richtigfalsch':
      return a.korrekt ? { ...b, richtig: true } : { ...b, richtig: false, wort: a.fehlerWort ?? '', text: a.loesungen[0] ?? '' }
    case 'fehler':
      return { ...b, wort: a.fehlerWort ?? '', text: a.loesungen[0] ?? '' }
    default:
      return null
  }
}

/** Alle Befunde des Selbsttests (leer = in Ordnung) */
export function selbsttest(a: GrammatikAufgabe): string[] {
  const m: string[] = []
  const l = a.loesungen ?? []
  const lueckenZahl = (a.satz.match(/_{3,}/g) ?? []).length
  // 1. Die eigene Lösung muss gelten
  const muster = musterAntwort(a)
  if (muster && blindUrteil(a, muster) !== 'richtig') m.push('die hinterlegte Lösung wird nicht als richtig gewertet')
  // Jede hinterlegte Variante beim Tippen
  if (['luecke', 'umformen', 'verbinden', 'frage'].includes(a.art))
    for (const x of l) if (pruefeGrammatik(a, x).urteil !== 'richtig') m.push(`Lösungsvariante „${x}“ wird nicht angenommen`)
  // 2. Aufbau je Format
  switch (a.art) {
    case 'luecke':
      if (lueckenZahl !== 1) m.push(`${lueckenZahl} statt einer Lücke`)
      if (!l.length) m.push('keine Lösung')
      break
    case 'auswahl': {
      const o = a.optionen ?? []
      if (o.length < 2) m.push('weniger als zwei Möglichkeiten')
      if (new Set(o.map(normiert)).size !== o.length) m.push('doppelte Möglichkeiten')
      const richtige = o.filter((x) => pruefeGrammatik(a, x).urteil === 'richtig')
      if (richtige.length !== 1) m.push(richtige.length ? `${richtige.length} Möglichkeiten gelten als richtig` : 'keine Möglichkeit ist die Lösung')
      if (a.satz !== '___' && lueckenZahl !== 1) m.push(`${lueckenZahl} statt einer Lücke`)
      break
    }
    case 'mehrfach': {
      const o = a.optionen ?? []
      if (o.length < 3) m.push('weniger als drei Möglichkeiten')
      if (l.some((x) => !o.some((y) => normiert(y) === normiert(x)))) m.push('eine Lösung steht nicht unter den Möglichkeiten')
      if (o.length && o.every((y) => l.some((x) => normiert(x) === normiert(y)))) m.push('alle Möglichkeiten sind richtig')
      if (pruefeGrammatik(a, JSON.stringify(o)).urteil === 'richtig' && o.length > l.length) m.push('alles ankreuzen gilt als richtig')
      break
    }
    case 'lueckentext': {
      const lk = a.luecken ?? []
      if (lueckenZahl !== lk.length) m.push(`${lueckenZahl} Lücken im Text, ${lk.length} Lösungen`)
      if (lk.length < 2) m.push('weniger als zwei Lücken')
      if (lk.some((x) => !x.loesungen.length)) m.push('Lücke ohne Lösung')
      break
    }
    case 'markieren': {
      const n = woerterVon(a.satz).length
      const z = a.ziele ?? []
      if (!z.length) m.push('nichts zu markieren')
      if (z.length >= n) m.push('alle Wörter sind zu markieren')
      break
    }
    case 'sortieren': {
      const g = a.gruppen ?? []
      const e = a.elemente ?? []
      if (g.length < 2) m.push('weniger als zwei Gruppen')
      if (g.some((_, i) => !e.some((x) => x.gruppe === i))) m.push('eine Gruppe bleibt leer')
      if (new Set(e.map((x) => normiert(x.text))).size !== e.length) m.push('doppelte Elemente')
      break
    }
    case 'zuordnen': {
      const p = a.paare ?? []
      if (new Set(p.map((x) => normiert(x.rechts))).size !== p.length) m.push('doppelte rechte Hälften')
      if (new Set(p.map((x) => normiert(x.links))).size !== p.length) m.push('doppelte linke Hälften')
      break
    }
    case 'fehler':
    case 'richtigfalsch': {
      if (a.art === 'richtigfalsch' && a.korrekt) break
      const w = woerterVon(a.satz).map(normiert)
      if (!a.fehlerWort || !w.includes(normiert(a.fehlerWort))) m.push('das Fehlerwort steht nicht im Satz')
      if (!l.length) m.push('keine Berichtigung')
      else if (normiert(l[0]) === normiert(a.fehlerWort ?? '')) m.push('Berichtigung gleich dem Fehlerwort')
      break
    }
    case 'satzbau': {
      const t = a.teile ?? []
      if (t.length < 3) m.push('weniger als drei Teile')
      if (l.length && ohneKomma(t.join(' ')) !== ohneKomma(l[0])) m.push('die Teile ergeben nicht die Lösung')
      break
    }
  }
  // 3. Satzanfang: jede Lösung beginnt damit (sonst könnten Lernende sie gar nicht eingeben)
  if (satzanfang(a.anfang) && (SATZ_ARTEN as readonly string[]).includes(a.art))
    for (const x of l) if (!ohneKomma(x).startsWith(ohneKomma(satzanfang(a.anfang)))) m.push(`Lösung „${x}“ beginnt nicht mit dem Satzanfang`)
  return [...new Set(m)]
}
