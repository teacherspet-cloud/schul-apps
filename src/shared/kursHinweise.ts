/**
 * Handlungsbedarf eines Sprachkurses (09.10.2026) – EINE Quelle für die Kursseite in Sprachenlernen und „Meine Klassen"
 * (server/klassen.ts). Rein rechnend: Kennzahlen und Hinweise aus dem Lernstand des Kurses (Test in 8 Tagen, unter 30 %
 * sicher nach 14 Tagen, 7 Tage nicht geübt, Grammatik-Schwäche → Fördern, Grammatik-Entwürfe zum Prüfen).
 *
 * Befund der Lehrkraft (09.10.2026): „Meine Klassen" zeigte für denselben Kurs andere Einträge als Sprachenlernen, und
 * ein Grammatik-Eintrag führte zur Vokabeltabelle. Deshalb rechnet der Server die Hinweise der Klassenkurse mit genau
 * dieser Funktion (`kursBedarf` macht daraus Einträge mit Schlüssel und Merkmal zum Ausblenden), die Kursseite zeigt für
 * Klassenkurse die Einträge des Servers; nur spontane Gruppen (ohne Lerngruppe) rechnen hier selbst. Jeder Hinweis nennt
 * den Reiter, in dem man etwas dagegen tut – Grammatik immer im Reiter „Grammatik".
 */

const TAG = 86_400_000

/** Reiter der Kursseite (wie KursReiter in renderer/…/kurs/kursDaten.ts) */
export type HinweisReiter = 'ueberblick' | 'vokabeln' | 'grammatik' | 'lernende' | 'einstellungen'

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

export type KursHinweisArt = 'entwurf' | 'termin' | 'schwach' | 'inaktiv' | 'foerdern' | 'leer' | 'geplant'

export interface KursHinweis {
  art: KursHinweisArt
  text: string
  /** Reiter, in dem man etwas dagegen tut */
  reiter: HinweisReiter
  farbe: string
  /** Betroffene Lernende (Kennungen) – Merkmal zum Ausblenden und Ziel der Details */
  ids?: string[]
  /** Testtermin (Merkmal) */
  termin?: number | null
  /** Anzahl (Entwürfe) */
  zahl?: number
}

export interface KursHinweisEingabe {
  status: string
  testTermin: number | null
  woerter: number
  teile?: { titel: string; anzahl: number; zeit: number }[]
  gesamt: { gesamt: number; sicher: number }
  lernende: { id?: string; name: string; tage7: number; uebersicht: { gesamt: number; sicher: number } }[]
  /** Grammatik-Entwürfe dieses Kurses, die noch geprüft werden müssen (liegen nur im Gerät der Lehrkraft) */
  entwuerfe?: number
  /** Lernende mit Grammatik-Schwäche (empfehlung → foerder) */
  foerder?: { id: string; name: string }[]
  /** Ältere Form: nur die Namen */
  foerderNamen?: string[]
}

export function kursKennzahlen(k: KursHinweisEingabe, jetzt = Date.now()): KursKennzahlen {
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
const kennungen = (l: { id?: string }[]): string[] | undefined => (l.every((x) => x.id) ? l.map((x) => x.id!) : undefined)

/** Grammatik-Entwürfe zum Prüfen – im Reiter „Grammatik" (stehen dort oben in der Tabelle) */
export function entwurfHinweis(n: number): KursHinweis | null {
  if (!n) return null
  return {
    art: 'entwurf',
    text: `${n} ${n === 1 ? 'Grammatik-Entwurf wartet' : 'Grammatik-Entwürfe warten'} auf Prüfung und Freigabe`,
    reiter: 'grammatik',
    farbe: 'yellow',
    zahl: n
  }
}

/** Handlungsbedarf des Kurses, das Wichtigste zuerst */
export function kursHinweise(k: KursHinweisEingabe, jetzt = Date.now()): KursHinweis[] {
  const aus: KursHinweis[] = []
  const offen = k.status === 'offen'
  const entwurf = entwurfHinweis(k.entwuerfe ?? 0)
  if (entwurf) aus.push(entwurf)
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
      farbe: 'blue',
      termin: z.test
    })
  // Unter 30 % sicher – erst, wenn der erste Abschnitt mindestens 14 Tage freigegeben ist
  const erster = (k.teile ?? []).map((t) => t.zeit).filter((x) => x && x <= jetzt)
  const reif = k.woerter > 0 && erster.length > 0 && jetzt - Math.min(...erster) >= 14 * TAG
  const schwach = reif ? k.lernende.filter((l) => l.uebersicht.gesamt > 0 && l.uebersicht.sicher / l.uebersicht.gesamt < 0.3) : []
  if (schwach.length)
    aus.push({ art: 'schwach', text: `Vokabeln unter 30 % sicher: ${namenListe(schwach.map((l) => l.name))}`, reiter: 'lernende', farbe: 'red', ids: kennungen(schwach) })
  const foerder = k.foerder ?? (k.foerderNamen ?? []).map((name) => ({ id: '', name }))
  if (foerder.length)
    aus.push({
      art: 'foerdern',
      text: `Grammatik-Schwäche – Fördern empfohlen: ${namenListe(foerder.map((l) => l.name))}`,
      // Grammatik → Reiter „Grammatik" (dort „Grammatik je Lernende/r" mit Details), nicht die Vokabeltabelle
      reiter: 'grammatik',
      farbe: 'orange',
      ids: kennungen(foerder.map((l) => ({ id: l.id || undefined })))
    })
  const inaktiv = k.woerter ? k.lernende.filter((l) => l.tage7 === 0) : []
  if (inaktiv.length)
    aus.push({
      art: 'inaktiv',
      text: `${inaktiv.length} ${inaktiv.length === 1 ? 'Lernende/r hat' : 'Lernende haben'} in den letzten 7 Tagen nicht geübt: ${namenListe(inaktiv.map((l) => l.name))}`,
      reiter: 'lernende',
      farbe: 'gray',
      ids: kennungen(inaktiv)
    })
  return aus
}

/** Geplante Abschnitte (Freigabe in der Zukunft), der nächste zuerst */
export function geplanteAbschnitte(teile: { titel: string; anzahl: number; zeit: number }[] | undefined, jetzt = Date.now()): { titel: string; anzahl: number; zeit: number }[] {
  return (teile ?? []).filter((t) => t.zeit > jetzt).sort((a, b) => a.zeit - b.zeit)
}

// ---------------------------------------------------------------- Als Handlungsbedarf der Klasse („Meine Klassen")

/** Art des Eintrags in „Meine Klassen" (Symbol und Farbe dort) */
export type KlassenBedarfArt = 'entscheiden' | 'foerdern' | 'inaktiv' | 'termin'
const KLASSEN_ART: Record<KursHinweisArt, KlassenBedarfArt> = {
  entwurf: 'entscheiden',
  termin: 'termin',
  schwach: 'foerdern',
  foerdern: 'foerdern',
  inaktiv: 'inaktiv',
  leer: 'inaktiv',
  geplant: 'termin'
}

/** Merkmal zum Ausblenden (wie Merkmal in server/klassen.ts): nur Kennungen, Zahlen, Termin – keine Namen */
export interface KursBedarfMerkmal {
  art: string
  ids?: string[]
  zahl?: number
  termin?: number | null
  text?: string
}

/** Ein Hinweis des Kurses als Eintrag im Handlungsbedarf der Klasse */
export interface KursBedarf {
  art: KlassenBedarfArt
  text: string
  /** Wohin der Klick außerhalb der Kursansicht führt: der Kurs in Sprachenlernen */
  ziel: { modul: string; id: string }
  /** Stabile Kennung (Kurs + Art), zum Ausblenden */
  schluessel: string
  merkmal: KursBedarfMerkmal
  /** Kurs (Vokabeltraining), Art des Hinweises, Reiter der Kursseite und Betroffene – für Klick und Filter */
  kurs: string
  hinweis: KursHinweisArt
  reiter: HinweisReiter
  ids?: string[]
}

export const kursBedarfSchluessel = (kurs: string, art: KursHinweisArt): string => `kurs:${kurs}:${art}`

/**
 * Hinweise eines Kurses als Einträge der Klasse. `name`: vorangestellt, wenn die Klasse mehrere laufende Kurse mit
 * Hinweisen hat – sonst gleicher Wortlaut wie auf der Kursseite.
 */
export function kursBedarf(kurs: { id: string; name?: string }, hinweise: KursHinweis[]): KursBedarf[] {
  return hinweise.map((h) => {
    const merkmal: KursBedarfMerkmal = { art: h.art }
    if (h.ids) merkmal.ids = h.ids
    if (h.termin) merkmal.termin = h.termin
    if (typeof h.zahl === 'number') merkmal.zahl = h.zahl
    return {
      art: KLASSEN_ART[h.art],
      text: kurs.name ? `${kurs.name}: ${h.text}` : h.text,
      ziel: { modul: 'vokabeltraining', id: kurs.id },
      schluessel: kursBedarfSchluessel(kurs.id, h.art),
      merkmal,
      kurs: kurs.id,
      hinweis: h.art,
      reiter: h.reiter,
      ...(h.ids ? { ids: h.ids } : {})
    }
  })
}

/** Farbe eines Eintrags auf der Kursseite (Hinweis-Art) */
export const HINWEIS_FARBE: Record<KursHinweisArt, string> = {
  entwurf: 'yellow',
  termin: 'blue',
  schwach: 'red',
  foerdern: 'orange',
  inaktiv: 'gray',
  leer: 'blue',
  geplant: 'blue'
}

/** Reiter in „Meine Klassen" für einen Kurs-Eintrag: Grammatik → „Grammatik", Lernende eintragen → „Lernende", sonst „Vokabeln" */
export const klassenReiterFuer = (b: Pick<KursBedarf, 'reiter' | 'hinweis'>): 'vokabeln' | 'grammatik' | 'lernende' =>
  b.reiter === 'grammatik' ? 'grammatik' : b.hinweis === 'leer' ? 'lernende' : 'vokabeln'
