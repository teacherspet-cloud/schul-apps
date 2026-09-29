/**
 * Automatisches Sichern mit Verzögerung – und die Möglichkeit, es SOFORT auszulösen.
 *
 * Anlass: Jedes Programm sicherte verzögert (1,2 bis 2,5 Sekunden nach der letzten
 * Änderung), damit nicht jeder Tastendruck eine Datei schreibt. Drückte die Lehrkraft in
 * dieser Zeit auf „Neu …", öffnete ein anderes Dokument, wechselte das Programm oder schloss
 * das Fenster, wurde die anstehende Sicherung VERWORFEN – die letzte Änderung war weg. Das
 * sah aus wie ein Fehler beim Speichern, war aber ein Fehler beim Aufräumen.
 *
 * Jetzt meldet jede Sicherung ihre „Sofort"-Funktion hier an. `sichereAlles()` führt alle
 * anstehenden aus und wartet darauf – vor dem Neuanfang, vor dem Öffnen, beim
 * Programmwechsel und bevor das Fenster zugeht.
 *
 * Diese Datei kennt weder React noch Mantine, damit sie sich ohne Oberfläche prüfen lässt.
 */

type Sofort = () => Promise<void>

const angemeldet = new Set<Sofort>()

/** Meldet eine Sicherung an; liefert die Abmeldung. */
export function meldeSicherungAn(sofort: Sofort): () => void {
  angemeldet.add(sofort)
  return () => {
    angemeldet.delete(sofort)
  }
}

/**
 * Alle anstehenden Sicherungen jetzt ausführen und abwarten.
 *
 * Wirft nie: Ein Fehler beim Sichern wird dort gemeldet, wo er entsteht. Hier soll er nicht
 * verhindern, dass die übrigen Programme ihre Arbeit sichern oder das Fenster schließt.
 */
export async function sichereAlles(): Promise<void> {
  await Promise.all([...angemeldet].map((sofort) => sofort().catch(() => undefined)))
}

/*
 * Gelöschte Dokumente (29.09.2026, „Löschen klappt oft erst beim zweiten Mal"): Was die
 * Lehrkraft gelöscht hat, darf in dieser Sitzung nicht wieder angelegt werden – weder von
 * einer noch laufenden Sicherung noch vom Ergebnis eines Hintergrund-Auftrags, der das
 * Dokument nicht mehr findet und es sonst aus seinem Schnappschuss neu abgelegt hätte.
 */
const geloescht = new Set<string>()

/** Merkt sich eine gelöschte Kennung; Sicherungen und Ablagen für sie werden verworfen. */
export function merkeGeloescht(id: string): void {
  if (id) geloescht.add(id)
}

/** Wurde dieses Dokument in dieser Sitzung gelöscht? */
export function istGeloescht(id: string): boolean {
  return geloescht.has(id)
}

export interface VerzoegerteSicherung {
  /** Sichern nach `ms` Millisekunden; eine noch anstehende Sicherung wird verschoben. */
  plane: (ms: number) => void
  /** Anstehendes sofort sichern; wartet auch auf eine gerade laufende Sicherung. */
  sofort: () => Promise<void>
  /** Steht eine Sicherung an? */
  steht: () => boolean
  /** Abmelden; Anstehendes wird dabei noch gesichert, nicht verworfen. */
  beende: () => void
}

/**
 * Eine Sicherung mit Verzögerung.
 *
 * Die Läufe werden HINTEREINANDER ausgeführt, nie gleichzeitig. Zwei gleichzeitige Läufe für
 * ein noch nie gesichertes Dokument hätten sonst zwei Einträge in der Bibliothek angelegt:
 * Der zweite sah die Kennung des ersten noch nicht.
 */
export function verzoegerteSicherung(speichern: () => Promise<void>, beiFehler: (e: unknown) => void): VerzoegerteSicherung {
  let timer: ReturnType<typeof setTimeout> | null = null
  let kette: Promise<void> = Promise.resolve()

  const lauf = (): Promise<void> => {
    timer = null
    kette = kette.then(speichern).catch(beiFehler)
    return kette
  }

  const s: VerzoegerteSicherung = {
    plane: (ms) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void lauf(), ms)
    },
    sofort: () => {
      if (timer) {
        clearTimeout(timer)
        return lauf()
      }
      return kette
    },
    steht: () => timer !== null,
    beende: () => {
      abmelden()
      if (timer) {
        clearTimeout(timer)
        void lauf()
      }
    }
  }
  const abmelden = meldeSicherungAn(s.sofort)
  return s
}

/**
 * Welcher Name wird gespeichert?
 *
 * Ein Entwurf wird schon gesichert, während das Thema noch getippt wird. Würde der erste
 * automatisch vergebene Name festgehalten, hieße das Blatt für immer „Photos" statt
 * „Photosynthese". Deshalb wandert der Vorschlag mit, SOLANGE der gespeicherte Name der
 * zuletzt vorgeschlagene ist. Hat die Lehrkraft ihn geändert, bleibt ihrer.
 */
const letzteVorschlaege = new Map<string, string>()

export function dokumentName(dokument: string, gespeichert: string, vorschlag: string): string {
  const bisher = gespeichert.trim()
  const name = !bisher || bisher === letzteVorschlaege.get(dokument) ? vorschlag : bisher
  if (name === vorschlag) letzteVorschlaege.set(dokument, vorschlag)
  return name
}
