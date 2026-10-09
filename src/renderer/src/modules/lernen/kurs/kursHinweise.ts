/**
 * Kopf und Überblick der Kursseite (09.10.2026, abgestimmt mit der Lehrkraft: „Kopf + Reiter"): die wichtigsten Zahlen
 * und „Handlungsbedarf" DIESES Kurses – rein rechnend aus der Antwort von GET /server/vokabeln/<id>, damit Sprachenlernen
 * und „Meine Klassen" dasselbe zeigen. Schwellen wie in server/klassen.ts (Test in 8 Tagen, unter 30 % sicher nach
 * 14 Tagen, 7 Tage nicht geübt).
 */
import type { KursReiter } from './kursDaten'

const TAG = 86_400_000

export interface KursKennzahlen {
  /** Anteil sicherer Wörter über alle Lernenden (0–1); null ohne Vokabeln */
  sicher: number | null
  /** Lernende, die in den letzten 7 Tagen geübt haben */
  aktiv: number
  lernende: number
  /** Nächster Testtermin in der Zukunft (ms) und Tage bis dahin */
  test: number | null
  tageBisTest: number | null
}

export interface KursHinweis {
  art: 'entwurf' | 'termin' | 'schwach' | 'inaktiv' | 'foerdern' | 'leer' | 'geplant'
  text: string
  /** Reiter, in dem man etwas dagegen tut */
  reiter: KursReiter
  farbe: string
}

interface Eingabe {
  status: string
  testTermin: number | null
  woerter: number
  teile?: { titel: string; anzahl: number; zeit: number }[]
  gesamt: { gesamt: number; sicher: number }
  lernende: { name: string; tage7: number; uebersicht: { gesamt: number; sicher: number } }[]
  /** Grammatik-Entwürfe dieses Kurses, die noch geprüft werden müssen */
  entwuerfe?: number
  /** Namen der Lernenden mit Grammatik-Schwäche (empfehlung → foerder) */
  foerderNamen?: string[]
}

export function kursKennzahlen(k: Eingabe, jetzt = Date.now()): KursKennzahlen {
  const test = k.testTermin && k.testTermin > jetzt - TAG ? k.testTermin : null
  return {
    sicher: k.woerter && k.gesamt.gesamt ? k.gesamt.sicher / k.gesamt.gesamt : k.woerter ? 0 : null,
    aktiv: k.lernende.filter((l) => l.tage7 > 0).length,
    lernende: k.lernende.length,
    test,
    tageBisTest: test ? Math.max(0, Math.ceil((test - jetzt) / TAG)) : null
  }
}

const namenListe = (n: string[], max = 6): string => (n.length > max ? `${n.slice(0, max).join(', ')} und ${n.length - max} weitere` : n.join(', '))

/** Handlungsbedarf des Kurses, das Wichtigste zuerst */
export function kursHinweise(k: Eingabe, jetzt = Date.now()): KursHinweis[] {
  const aus: KursHinweis[] = []
  const offen = k.status === 'offen'
  if (k.entwuerfe)
    aus.push({
      art: 'entwurf',
      text: `${k.entwuerfe} ${k.entwuerfe === 1 ? 'Grammatik-Entwurf wartet' : 'Grammatik-Entwürfe warten'} auf Prüfung und Freigabe`,
      reiter: 'grammatik',
      farbe: 'yellow'
    })
  if (!offen) return aus
  if (!k.lernende.length) {
    aus.push({ art: 'leer', text: 'Noch niemand im Kurs – Lernende eintragen oder den Code nennen', reiter: 'lernende', farbe: 'blue' })
    return aus
  }
  const z = kursKennzahlen(k, jetzt)
  if (k.woerter && z.test && z.test - jetzt < 8 * TAG)
    aus.push({
      art: 'termin',
      text: `Vokabeltest am ${new Date(z.test).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} – Kurs im Schnitt ${Math.round((z.sicher ?? 0) * 100)} % sicher`,
      reiter: 'vokabeln',
      farbe: 'blue'
    })
  // Unter 30 % sicher – erst, wenn der erste Abschnitt mindestens 14 Tage freigegeben ist
  const erster = (k.teile ?? []).map((t) => t.zeit).filter((x) => x && x <= jetzt)
  const reif = k.woerter > 0 && erster.length > 0 && jetzt - Math.min(...erster) >= 14 * TAG
  const schwach = reif ? k.lernende.filter((l) => l.uebersicht.gesamt > 0 && l.uebersicht.sicher / l.uebersicht.gesamt < 0.3).map((l) => l.name) : []
  if (schwach.length) aus.push({ art: 'schwach', text: `Vokabeln unter 30 % sicher: ${namenListe(schwach)}`, reiter: 'lernende', farbe: 'red' })
  if (k.foerderNamen?.length)
    aus.push({
      art: 'foerdern',
      text: `Grammatik-Schwäche – Fördern empfohlen: ${namenListe(k.foerderNamen)}`,
      reiter: 'lernende',
      farbe: 'orange'
    })
  const inaktiv = k.woerter ? k.lernende.filter((l) => l.tage7 === 0).map((l) => l.name) : []
  if (inaktiv.length)
    aus.push({
      art: 'inaktiv',
      text: `${inaktiv.length} ${inaktiv.length === 1 ? 'Lernende/r hat' : 'Lernende haben'} in den letzten 7 Tagen nicht geübt: ${namenListe(inaktiv)}`,
      reiter: 'lernende',
      farbe: 'gray'
    })
  return aus
}

/** Geplante Abschnitte (Freigabe in der Zukunft), der nächste zuerst */
export function geplanteAbschnitte(teile: { titel: string; anzahl: number; zeit: number }[] | undefined, jetzt = Date.now()): { titel: string; anzahl: number; zeit: number }[] {
  return (teile ?? []).filter((t) => t.zeit > jetzt).sort((a, b) => a.zeit - b.zeit)
}
