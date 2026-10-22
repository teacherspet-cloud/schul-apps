/**
 * Namensfilter auf dem Server einbinden (02.10.2026) – siehe namensfilter.ts.
 *
 * Umhüllt den Aufruf der Kanäle: KI-Anfragen werden geschützt und die Antworten wieder mit
 * Klarnamen versehen, Hörtexte mit echten Namen gesperrt. Das Register der Namen kommt aus der
 * Datenbank (alle Konten der Schule) und aus den Einstellungen des Nutzers (Briefkopf); die
 * Muster werden eine Minute zwischengespeichert.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { StructuredRequest, TtsRequest } from '@shared/types'
import { getSettings } from '../main/services/storage/settings'
import { alleNutzer, protokolliereServer } from './datenbank'
import { aktuellerNutzer } from './kontext'
import { musterFuer, personAus, pruefeHoertext, schuetzeAnfrage, schuetzeText, stelleWiederHer, type Muster, type Person } from './namensfilter'
import type { Aufruf } from './http'
import { lerngruppenVon, mitgliederVon } from './onlinetest'

let schule: { zeit: number; personen: Person[] } | null = null

/** Alle Menschen der Schule, die der Server kennt (Konten) */
function personenDerSchule(): Person[] {
  if (schule && Date.now() - schule.zeit < 60_000) return schule.personen
  const personen = alleNutzer()
    .filter((n) => n.quelle !== 'test')
    .map((n) => personAus(n.name, n.benutzer))
    .filter((p): p is Person => Boolean(p))
  schule = { zeit: Date.now(), personen }
  return personen
}

/** Nach dem Anlegen/Ändern von Konten neu lesen */
export const registerVergessen = (): void => {
  schule = null
  gruppen.clear()
}

/**
 * Vornamen der eigenen Lerngruppen (22.10.2026, KI-Sicherheitsprüfung): Ein Vorname allein („Lisa hat …") wurde bisher
 * nur mit Klassenliste der Anfrage erkannt. Für jede Anfrage einer Lehrkraft gelten jetzt die Vornamen ihrer
 * Lerngruppen als Klassenliste (`streng`) – ob Name oder Wort (Rose, Mark), entscheidet wie bisher personOderWort.ts.
 * Faustregel für die Kosten: nur Vornamen, je Lehrkraft eine Minute zwischengespeichert, höchstens 400 Namen.
 */
const gruppen = new Map<string, { zeit: number; namen: string[] }>()
export function vornamenDerLerngruppen(lehrkraftId: string): string[] {
  const da = gruppen.get(lehrkraftId)
  if (da && Date.now() - da.zeit < 60_000) return da.namen
  const namen = new Set<string>()
  try {
    for (const g of lerngruppenVon(lehrkraftId))
      for (const n of mitgliederVon(g)) {
        const v = personAus(n.name)?.vorname.trim()
        if (v && v.length >= 2) namen.add(v)
      }
  } catch {
    // ohne Lerngruppen (z. B. Tests ohne Tabelle) nur die übrigen Namen
  }
  const liste = [...namen].slice(0, 400)
  gruppen.set(lehrkraftId, { zeit: Date.now(), namen: liste })
  return liste
}

/**
 * Klassenliste einer KI-Anfrage (08.10.2026): Namen der Lernenden, um die es geht (auch Gäste mit nur einem Vornamen),
 * dazu Sprache und Material (Aufgaben, Erwartungen, Vokabeln) für die Entscheidung Person/Wort (personOderWort.ts).
 */
export interface Namensliste {
  namen: string[]
  sprache?: string
  material?: string
}
const liste = new AsyncLocalStorage<Namensliste>()

/** `fn` mit dieser Klassenliste ausführen – alle KI-Aufrufe darin ersetzen deren Namen auch einzeln */
export const mitNamensliste = <T>(l: Namensliste, fn: () => T): T => liste.run(l, fn)

/** Muster für den angemeldeten Nutzer: Schule + eigene Namen aus den Einstellungen (+ Klassenliste der Anfrage) */
export function namensMuster(zusatz: Person[] = []): Muster[] {
  const eigene: Person[] = []
  try {
    const lehrkraft = getSettings().briefkopf?.lehrkraft
    const p = lehrkraft ? personAus(lehrkraft.replace(/^(Herr|Frau|Dr\.|StR|OStR|StD)\s+/gi, '')) : null
    if (p) eigene.push(p)
  } catch {
    // ohne Einstellungen nur die Schule
  }
  const l = liste.getStore()
  const klasse = (l?.namen ?? [])
    .map((n) => personAus(n))
    .filter((p): p is Person => Boolean(p))
    .map((p) => ({ ...p, streng: true }))
  // Vornamen der Lerngruppen der Lehrkraft (22.10.2026) – ohne die, die schon in der Klassenliste stehen
  const ich = aktuellerNutzer()
  const schon = new Set(klasse.map((p) => p.vorname.toLowerCase()))
  const gruppe: Person[] =
    ich && ich.rolle !== 'schueler'
      ? vornamenDerLerngruppen(ich.id)
          .filter((v) => !schon.has(v.toLowerCase()))
          .map((v) => ({ vorname: v, nachname: '', streng: true }))
      : []
  return musterFuer([...personenDerSchule(), ...eigene, ...zusatz, ...klasse, ...gruppe], { sprache: l?.sprache, material: l?.material })
}

/** Den Aufruf der Kanäle mit dem Namensschutz umhüllen */
export function mitNamensschutz(aufruf: Aufruf): Aufruf {
  return async (kanal, args) => {
    const n = aktuellerNutzer()
    if (kanal === 'ai:structured' && args[0] && typeof args[0] === 'object') {
      const { req, z } = schuetzeAnfrage(args[0] as StructuredRequest, namensMuster())
      if (z.anzahl) protokolliereServer('namensschutz', `${z.anzahl} Namen vor der KI ersetzt (${req.schemaName})`, n?.id)
      return stelleWiederHer(await aufruf(kanal, [req, ...args.slice(1)]), z)
    }
    if ((kanal === 'ai:websuche' || kanal === 'ai:image') && typeof args[0] === 'string') {
      const { text, z } = schuetzeText(args[0], namensMuster())
      if (z.anzahl) protokolliereServer('namensschutz', `${z.anzahl} Namen vor der KI ersetzt (${kanal})`, n?.id)
      return stelleWiederHer(await aufruf(kanal, [text, ...args.slice(1)]), z)
    }
    if (kanal === 'audio:speak' && args[0] && typeof args[0] === 'object') {
      try {
        pruefeHoertext(args[0] as TtsRequest, namensMuster())
      } catch (e) {
        protokolliereServer('namensschutz', 'Hörtext mit echtem Namen gesperrt', n?.id)
        throw e
      }
    }
    return aufruf(kanal, args)
  }
}
