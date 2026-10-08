/**
 * Jede Stunde bekommt etwas (08.10.2026, Befund der Lehrkraft): Die KI-Planung ließ Stunden leer und überfüllte andere –
 * eine Doppelstunde zählte sie mal als eine, mal als zwei Stunden. Hier die Prüfung nach der Planung, die Grundlage der
 * Nachfrage an die KI („bitte neu verteilen") und die feste Verteilung als letzter Ausweg. Dazu: den Plan auf das
 * Stundenraster legen, für das er geplant wurde (`planAufRaster`).
 *
 * Stunde = Termin: Eine Doppelstunde ist EINE Stunde mit 90 Minuten (Zählung ab 1 in der Anfrage, ab 0 am Schritt).
 * Minuten zählen wie in der Stundenansicht nur die Pflichtschritte – Wahl, Förder-, Forder- und optionale Schritte laufen
 * neben dem gemeinsamen Weg.
 */
import { STUNDEN_MINUTEN, type Schritt, type StundenArt } from '@shared/reihe'

type PlanSchritt = Pick<Schritt, 'stunde' | 'minuten' | 'rolle'>

export interface Abdeckung {
  ok: boolean
  /** Stunden ohne Schritt (Index ab 0) */
  leer: number[]
  /** Stunden, deren Pflichtminuten die Länge übersteigen */
  ueberlang: number[]
  /** Pflichtminuten je Stunde */
  summen: number[]
  /** Schritte ohne gültige Stunde */
  ohneStunde: number
}

const zaehlt = (s: PlanSchritt): boolean => s.rolle === 'pflicht' || s.rolle === undefined

/** Hat jede Stunde mindestens einen Schritt, und passen die Pflichtminuten in jede Stunde? */
export function pruefeAbdeckung(schritte: PlanSchritt[], stunden: StundenArt[]): Abdeckung {
  const summen = stunden.map(() => 0)
  const belegt = stunden.map(() => 0)
  let ohneStunde = 0
  for (const s of schritte) {
    const i = s.stunde
    if (i === undefined || i < 0 || i >= stunden.length) {
      ohneStunde++
      continue
    }
    belegt[i]++
    if (zaehlt(s)) summen[i] += s.minuten ?? 0
  }
  const leer = stunden.map((_, i) => i).filter((i) => !belegt[i])
  const ueberlang = stunden.map((_, i) => i).filter((i) => summen[i] > STUNDEN_MINUTEN[stunden[i]])
  return { ok: !leer.length && !ueberlang.length && !ohneStunde, leer, ueberlang, summen, ohneStunde }
}

/** Befund in Worten für die Nachfrage an die KI (Stunden ab 1 gezählt) */
export function abdeckungText(a: Abdeckung, stunden: StundenArt[]): string {
  const teile: string[] = []
  if (a.leer.length) teile.push(`Ohne Schritt: Stunde ${a.leer.map((i) => i + 1).join(', ')}.`)
  if (a.ueberlang.length)
    teile.push(
      `Zu voll (Pflichtminuten > Länge): ${a.ueberlang.map((i) => `Stunde ${i + 1} mit ${a.summen[i]} von ${STUNDEN_MINUTEN[stunden[i]]} min`).join('; ')}.`
    )
  if (a.ohneStunde) teile.push(`${a.ohneStunde} Schritte haben eine Stundennummer außerhalb von 1 bis ${stunden.length}.`)
  return teile.join(' ')
}

/** Anteil einer Stunde, den die Schritte füllen dürfen – etwa ein Viertel bleibt für Einstieg, Besprechung, Sicherung */
const NUTZBAR = 0.75

/**
 * Feste Verteilung als letzter Ausweg: Schritte in ihrer Reihenfolge auf die Stunden – jede Stunde bekommt mindestens
 * einen Schritt (solange es genug Schritte gibt), eine Stunde wird gefüllt, bis etwa drei Viertel ihrer Länge verplant
 * sind. Passen die Minuten einer Stunde dann noch immer nicht hinein, werden sie anteilig gekürzt (mindestens 5 min).
 * Liefert neue Schritte (Stunde und ggf. Minuten geändert), die Eingabe bleibt unverändert.
 */
export function verteileAufStunden<T extends PlanSchritt>(schritte: T[], stunden: StundenArt[]): T[] {
  if (!stunden.length) return schritte.map((s) => ({ ...s }))
  const aus = schritte.map((s) => ({ ...s }))
  let stunde = 0
  let summe = 0
  let imAktuellen = 0
  aus.forEach((s, k) => {
    const restSchritte = aus.length - k
    const restStunden = stunden.length - stunde - 1
    const min = zaehlt(s) ? (s.minuten ?? 0) : 0
    const passt = summe + min <= STUNDEN_MINUTEN[stunden[stunde]] * NUTZBAR
    // Weiter zur nächsten Stunde, wenn diese voll ist – oder wenn sonst spätere Stunden leer blieben
    if (imAktuellen > 0 && stunde < stunden.length - 1 && (!passt || restSchritte <= restStunden)) {
      stunde++
      summe = 0
      imAktuellen = 0
    }
    s.stunde = stunde
    summe += min
    imAktuellen++
  })
  // Überlange Stunden: Pflichtminuten anteilig kürzen
  const a = pruefeAbdeckung(aus, stunden)
  for (const i of a.ueberlang) {
    const laenge = STUNDEN_MINUTEN[stunden[i]]
    const faktor = (laenge * 0.9) / a.summen[i]
    for (const s of aus) if (s.stunde === i && zaehlt(s) && s.minuten) s.minuten = Math.max(5, Math.floor(s.minuten * faktor))
  }
  return aus
}

/**
 * Den fertigen Plan auf das Stundenraster der Reihe legen (08.10.2026). Geplant wurde für das Raster `geplant` (Stand beim
 * Start der Planung). Hat sich das Raster seitdem nicht verändert oder ist es nur hinten länger geworden, gelten die
 * Stunden wie geplant. Sonst (Stunden entfernt oder umgestellt):
 *  - beim Ersetzen gilt wieder das geplante Raster (alte Schritte und Verläufe fallen ohnehin weg);
 *  - beim Anhängen kommen die geplanten Stunden hinter die vorhandenen (wie „Aus Schulbuch").
 */
export function planAufRaster<T extends Pick<Schritt, 'stunde'>>(
  aktuell: StundenArt[] | undefined,
  geplant: StundenArt[] | undefined,
  schritte: T[],
  ersetzen: boolean
): { stunden: StundenArt[]; schritte: T[]; versetzt: boolean } {
  const jetzt = aktuell ?? []
  const plan = geplant ?? jetzt
  const passt = plan.length <= jetzt.length && plan.every((a, i) => jetzt[i] === a)
  if (passt) return { stunden: jetzt, schritte, versetzt: false }
  if (ersetzen) return { stunden: [...plan], schritte, versetzt: false }
  const versatz = jetzt.length
  return {
    stunden: [...jetzt, ...plan],
    schritte: schritte.map((s) => (s.stunde === undefined ? s : { ...s, stunde: s.stunde + versatz })),
    versetzt: true
  }
}
