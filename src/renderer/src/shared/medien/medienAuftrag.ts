/**
 * Medienaufträge der Vokabellisten (06.10.2026, Wunsch der Lehrkraft): Beispielbilder suchen, Bilder von der KI
 * erzeugen, Aussprache und Satz-Aussprache erzeugen – als Hintergrund-Aufträge in der Auftragsleiste unten rechts
 * (shared/auftraege.ts), wie beim Arbeitsblatt.
 *
 * - Jeder Auftrag gehört zu einer STELLE: einer eigenen Liste (docId = Kennung der Liste) oder einem Abschnitt
 *   eines Schulbuchs (docId = „buch:<Kennung>|<Unit>|<Abschnitt>"). „Öffnen" in der Leiste führt genau dorthin
 *   (VokabellisteModule meldet den Öffner an).
 * - Mehrere Abschnitte lassen sich auf einmal in Auftrag geben; es laufen höchstens zwei Medienaufträge
 *   zugleich, die übrigen warten sichtbar der Reihe nach.
 * - Meldet ein Dienst eine Begrenzung (429, Kontingent, Nutzungsgrenze des Abos), wartet der Auftrag – „wartet
 *   bis 14:35" – und macht danach weiter (medienWarten.ts). Die Sperre gilt für alle Aufträge desselben Dienstes.
 * - Ein Pop-up („Von der KI erzeugen") darf geschlossen werden: Der Auftrag läuft weiter, die Tabelle zeigt das
 *   Bild, sobald es da ist (`medienGeaendert`).
 */
import { satzSchluessel, sprachKurz, istGanzerSatz, type MedienSicht } from '@shared/medienbank'
import { starteAuftrag, type AuftragsKontext } from '../auftraege'
import { bildErzeugen, bildKandidaten, kandidatUebernehmen, kiWaehlt, tonErzeugen, type Ki, type Lernende, type Vokabel } from './medienbank'
import { DIENST_NAME, DienstSperren, MAX_WARTEN_MS, Plaetze, uhrzeitLabel, wartezeit, type Dienst } from './medienWarten'

export const MEDIEN_MODUL = 'vokabelliste'

/** Wo die Vokabeln stehen – Ziel von „Öffnen" */
export interface MedienZiel {
  docId: string
  /** Name in der Auftragsleiste („Green Line 1 – Unit 2, A") */
  titel: string
  /** Klassenstufe der Lernenden (Bildart: Cliparts bis Klasse 6) */
  klasse?: number
}

export const zielListe = (id: string, name: string, klasse?: number): MedienZiel => ({ docId: id, titel: name || 'Vokabelliste', klasse })
export const zielBuch = (buchId: string, buchName: string, unit: string, abschnitt: string, klasse?: number): MedienZiel => ({
  docId: `buch:${buchId}|${unit}|${abschnitt}`,
  titel: `${buchName} – ${unit}, ${abschnitt}`,
  klasse
})
/** Kennung eines Schulbuch-Abschnitts zurücklesen (null = eine eigene Liste) */
export function leseBuchZiel(docId: string): { buchId: string; unit: string; abschnitt: string } | null {
  if (!docId.startsWith('buch:')) return null
  const [buchId, unit = '', abschnitt = ''] = docId.slice(5).split('|')
  return buchId ? { buchId, unit, abschnitt } : null
}

/*
 * Welche Stelle gerade im Programm zu sehen ist – dann genügt bei „Öffnen" der Wechsel ins Programm.
 * Listen- und Buch-Editor melden sich hier an und ab.
 */
let ansicht: string | null = null
export function setzeVokabelAnsicht(docId: string | null): void {
  ansicht = docId
}
export const istVokabelAnsicht = (docId: string): boolean => ansicht === docId

/* Tabellen hören mit: Nach jedem erledigten Wort zeigen sie den neuen Stand (auch nach geschlossenem Pop-up) */
const hoerer = new Set<(sprache: string) => void>()
export function aufMedienAenderung(fn: (sprache: string) => void): () => void {
  hoerer.add(fn)
  return () => void hoerer.delete(fn)
}
export function medienGeaendert(sprache: string): void {
  for (const fn of hoerer) fn(sprachKurz(sprache))
}

export type MedienArt = 'bilder' | 'aussprache' | 'satz' | 'bildKi'

const ART_NAME: Record<MedienArt, string> = {
  bilder: 'Beispielbilder suchen',
  aussprache: 'Aussprache erzeugen',
  satz: 'Satz-Aussprache erzeugen',
  bildKi: 'Beispielbild von der KI'
}

/** Schlüssel des Auftrags (Knöpfe zeigen „läuft", solange er da ist) */
export const medienSchluessel = (art: MedienArt, wort?: string): string => `medien:${art}${wort ? `:${wort}` : ''}`

const sperren = new DienstSperren()
const plaetze = new Plaetze(2)
const schlafe = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms))

/**
 * Einen Schritt bei einem Dienst ausführen – mit Warten bei Begrenzung. Vorher: Ist der Dienst gesperrt
 * (eben 429 bekommen, auch in einem anderen Auftrag), erst bis dahin warten.
 */
export async function beimDienst<T>(k: Pick<AuftragsKontext, 'signal' | 'pausiere'>, dienst: Dienst, schritt: () => Promise<T>): Promise<T> {
  let gewartet = 0
  for (let versuch = 0; ; versuch++) {
    const bis = sperren.gesperrtBis(dienst)
    if (bis) {
      const ms = bis - Date.now()
      gewartet += ms
      await k.pausiere(`${DIENST_NAME[dienst]} ist ausgelastet – wartet bis ${uhrzeitLabel(bis)}`, schlafe(ms))
    }
    try {
      return await schritt()
    } catch (e) {
      if (k.signal.aborted) throw e
      const ms = wartezeit(e, versuch)
      if (ms === null || gewartet + ms > MAX_WARTEN_MS) throw e
      sperren.sperre(dienst, Date.now() + ms)
    }
  }
}

export interface MedienStart {
  art: MedienArt
  sprache: string
  vokabeln: Vokabel[]
  ziel: MedienZiel
  /** Stimme für die Aussprache – fehlt = Standardstimme der Sprache */
  stimme?: string
  /** Nur diese Wörter, auch wenn sie schon Medien haben (einzelne Zelle, Pop-up) – sonst nur, was fehlt */
  einzeln?: boolean
}

export interface MedienErgebnis {
  erledigt: number
  leer: number
  fehler: number
  gesamt: number
}

/** Was einem Wort fehlt – nur das wird in Auftrag gegeben */
export function offeneVokabeln(art: MedienArt, vokabeln: Vokabel[], daten: Record<string, MedienSicht>): Vokabel[] {
  const woerter = vokabeln.filter((v) => v.term.trim())
  if (art === 'bilder' || art === 'bildKi') return woerter.filter((v) => !daten[v.term]?.bild)
  if (art === 'aussprache') return woerter.filter((v) => !daten[v.term]?.ton || daten[v.term]?.ton?.text.trim() !== v.term.trim())
  return woerter.filter((v) => istGanzerSatz(v.example) && !daten[v.term]?.saetze?.[satzSchluessel(v.example!)])
}

/** Ein Wort bearbeiten; false = kein passendes Bild gefunden */
async function eines(art: MedienArt, sp: string, v: Vokabel, stimme: string, lernende: Lernende, k: AuftragsKontext): Promise<boolean> {
  const ki: Ki = { ai: k.ai, bild: k.bild }
  if (art === 'aussprache') return await beimDienst(k, 'sprache', () => tonErzeugen(sp, v.term, 'wort', v.term, stimme)), true
  if (art === 'satz') return await beimDienst(k, 'sprache', () => tonErzeugen(sp, v.term, 'satz', v.example ?? '', stimme)), true
  if (art === 'bildKi') return await beimDienst(k, 'bildki', () => bildErzeugen(sp, v, lernende, ki)), true
  const kandidaten = await beimDienst(k, 'bildsuche', () => bildKandidaten(sp, v, lernende))
  if (!kandidaten.length) return false
  const i = await beimDienst(k, 'ki', () => kiWaehlt(sp, v, kandidaten, lernende, ki))
  if (i < 0) return false
  await beimDienst(k, 'bildsuche', () => kandidatUebernehmen(sp, v.term, kandidaten[i], kandidaten))
  return true
}

/**
 * Startet einen Medienauftrag. Liefert das Ergebnis, sobald er fertig ist (null bei Abbruch oder Fehler –
 * der Fehler steht dann schon als Hinweis da). Wer nur anstoßen will, wartet nicht darauf.
 */
export function starteMedienAuftrag(s: MedienStart): Promise<MedienErgebnis | null> {
  const sp = sprachKurz(s.sprache)
  const wort = s.einzeln && s.vokabeln.length === 1 ? s.vokabeln[0].term : undefined
  return starteAuftrag<MedienStart, MedienErgebnis>({
    moduleId: MEDIEN_MODUL,
    docId: s.ziel.docId,
    titel: wort ? `„${wort}" – ${s.ziel.titel}` : s.ziel.titel,
    art: ART_NAME[s.art],
    eingabe: s,
    istOffen: () => istVokabelAnsicht(s.ziel.docId),
    // Medien ändern die Liste nicht – das Dokument bleibt bearbeitbar
    sperrt: false,
    schluessel: medienSchluessel(s.art, wort),
    fehlerTitel: `${ART_NAME[s.art]}: fehlgeschlagen`,
    arbeit: async (e, k) => {
      let frei = plaetze.nimm()
      if (!frei) {
        const platz = plaetze.belege(k.signal)
        try {
          frei = await k.pausiere('Wartet, bis andere Medienaufträge fertig sind …', platz)
        } catch (fehler) {
          // Platz kam zugleich mit dem Abbruch: gleich wieder freigeben
          platz.then(
            (f) => f(),
            () => undefined
          )
          throw fehler
        }
      }
      try {
        let liste = e.vokabeln.filter((v) => v.term.trim())
        if (!e.einzeln) {
          // Frisch nachsehen, was fehlt – inzwischen kann ein anderer Auftrag einiges erledigt haben
          const daten = await window.api.medien.eintraege(
            sp,
            liste.map((v) => v.term)
          )
          liste = offeneVokabeln(e.art, liste, daten)
        }
        let stimme = e.stimme ?? ''
        if ((e.art === 'aussprache' || e.art === 'satz') && !stimme) {
          stimme = (await window.api.medien.stimmen())[sp] ?? ''
          if (!stimme)
            throw new Error('Für diese Sprache ist keine Standardstimme eingestellt (Einstellungen › Bilder und Hörtexte › „Aussprache der Vokabeln“).')
        }
        const erg: MedienErgebnis = { erledigt: 0, leer: 0, fehler: 0, gesamt: liste.length }
        let ersterFehler: unknown = null
        for (const [i, v] of liste.entries()) {
          if (k.signal.aborted) break
          k.melde(`„${v.term}" (${i + 1} von ${liste.length})`, i, liste.length)
          try {
            if (await eines(e.art, sp, v, stimme, { klasse: e.ziel.klasse }, k)) erg.erledigt++
            else erg.leer++
            medienGeaendert(sp)
          } catch (fehler) {
            if (k.signal.aborted) throw fehler
            erg.fehler++
            ersterFehler ??= fehler
          }
        }
        k.melde('Fertig', liste.length, Math.max(1, liste.length))
        // Nichts ging: Der Fehler gehört in die Leiste (mit „Erneut versuchen"), nicht in eine Zusammenfassung
        if (erg.fehler && !erg.erledigt && !erg.leer) throw ersterFehler
        return erg
      } finally {
        frei?.()
      }
    },
    abschluss: (r) =>
      r.gesamt === 0
        ? 'Nichts zu tun – alles schon vorhanden.'
        : `${r.erledigt} von ${r.gesamt} erledigt${r.leer ? `, ${r.leer} ohne passendes Bild` : ''}${r.fehler ? `, ${r.fehler} mit Fehler` : ''}.`,
    ablegen: async () => medienGeaendert(sp)
  })
}

/** Nur für Tests: Sperren vergessen */
export const vergissSperren = (): void => sperren.leeren()
