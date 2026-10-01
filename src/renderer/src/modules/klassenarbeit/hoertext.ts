/**
 * Hörtexte der Klassenarbeit (01.10.2026): Änderungswunsch am Skript und Bearbeitungszeit des
 * Hörverstehensteils aus der gemessenen Aufnahme.
 *
 * - Änderungswunsch: derselbe Ablauf wie im Arbeitsblatt (arbeitsblatt/generation/hoertextWunsch.ts).
 *   Der Hörtext steht in jeder Fassung mit DERSELBEN Kennung; die Aufgaben dazu sind je Fassung
 *   verschieden und werden je Fassung angepasst – alles in einem Rückgängig-Schritt.
 * - Bearbeitungszeit: Sobald ALLE Hörtexte eines Teils vertont und gemessen sind, folgt die
 *   Minutenzahl des Teils aus Spieldauer, Durchgängen, Einlesezeit und Pausen nach den Vorgaben
 *   des Landes (didactics/hoerablauf.ts). Angepasst wird nur, wenn sich eine Messung geändert hat –
 *   eine von Hand gesetzte Zeit bleibt sonst stehen.
 */
import { starteAuftrag } from '../../shared/auftraege'
import type { WunschArt } from '../../shared/kiWunsch'
import { notifySuccess } from '../../shared/util'
import { hoerBearbeitungszeit, hoerMinuten, hoerzeit } from '../../shared/verstehen/hoerzeit'
import { hoerablaufFuer, hoerStufe } from '../arbeitsblatt/didactics/hoerablauf'
import { hoertextWunschAusfuehren, wendeHoertextWunschAn } from '../arbeitsblatt/generation/hoertextWunsch'
import type { AudioBlock, WsBlock } from '../arbeitsblatt/model/types'
import { profileFromMeta } from '../arbeitsblatt/render/SheetPages'
import { arbeitOffen, legeArbeitAb } from './library'
import { bloeckeDerFassung, fassungsZahl, mitBloecken } from './model/fassungen'
import type { Exam } from './model/types'
import { examToWorksheet } from './render/examWorksheet'

/** Wo der Hörtext steht: je Teil und Fassung die Bausteinliste */
export function hoertextOrte(exam: Exam, audioId: string): { teil: number; fassung: number; bloecke: WsBlock[] }[] {
  const out: { teil: number; fassung: number; bloecke: WsBlock[] }[] = []
  exam.parts.forEach((p, teil) => {
    for (let fassung = 0; fassung < fassungsZahl(exam); fassung++) {
      const bloecke = bloeckeDerFassung(p, fassung)
      if (bloecke.some((b) => b.id === audioId)) out.push({ teil, fassung, bloecke })
    }
  })
  return out
}

export function hoertextWunschKlassenarbeit(exam: Exam, docId: string, titel: string, audioId: string, art: WunschArt, wunsch: string): void {
  void starteAuftrag({
    moduleId: 'klassenarbeit',
    docId,
    titel,
    art: art === 'neu' ? 'Hörtext neu schreiben' : 'Hörtext überarbeiten',
    eingabe: exam,
    istOffen: () => arbeitOffen(docId),
    sperrt: false,
    // Dieselbe Kennung wie beim Überarbeiten eines Bausteins – die Knöpfe drehen solange
    schluessel: `block-${audioId}`,
    fehlerTitel: 'Der Hörtext konnte nicht überarbeitet werden',
    arbeit: async (e, k) => {
      const orte = hoertextOrte(e, audioId)
      const ws = examToWorksheet(e, 0)
      const erg = await hoertextWunschAusfuehren({
        listen: orte.map((o) => o.bloecke),
        audioId,
        art,
        wunsch,
        meta: ws.meta,
        profile: profileFromMeta(ws.meta),
        ai: k.ai,
        melde: (t) => k.melde(t)
      })
      return { ...erg, orte: orte.map(({ teil, fassung }) => ({ teil, fassung })) }
    },
    abschluss: (erg) => erg.zusammenfassung,
    ablegen: async (erg, e) => {
      await legeArbeitAb(docId, e, (aktuell) => ({
        ...aktuell,
        parts: aktuell.parts.map((p, teil) =>
          erg.orte.reduce(
            (q, o, i) =>
              o.teil === teil ? mitBloecken(q, o.fassung, wendeHoertextWunschAn(bloeckeDerFassung(q, o.fassung), audioId, erg.skript, erg.anpassungen[i]?.bloecke ?? new Map())) : q,
            p
          )
        )
      }))
      notifySuccess(erg.zusammenfassung)
    }
  })
}

/** Gemessene Dauer je Hörtext der Arbeit (nur Fassung A – die Hörtexte sind in allen gleich) */
export function gemesseneHoerzeiten(exam: Exam): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of exam.parts)
    for (const b of p.blocks)
      if (b.type === 'audio') {
        const h = hoerzeit(b)
        if (h.echt) m.set(b.id, h.sekunden)
      }
  return m
}

/**
 * Bearbeitungszeit der Hörteile an die gemessenen Aufnahmen anpassen – nur für Teile, in denen
 * sich gegenüber `vorher` eine Messung geändert hat und deren Hörtexte ALLE gemessen sind.
 * Ändert `exam` an Ort und Stelle; liefert eine Meldung je angepasstem Teil.
 */
export function hoerteilZeitenAnpassen(exam: Exam, vorher: Map<string, number>): string[] {
  const ablauf = hoerablaufFuer(exam.meta.stateId, hoerStufe(exam.meta.grade))
  const nachher = gemesseneHoerzeiten(exam)
  const meldungen: string[] = []
  for (const p of exam.parts) {
    const audios = p.blocks.filter((b): b is AudioBlock => b.type === 'audio')
    if (!audios.length || !audios.some((a) => nachher.get(a.id) !== vorher.get(a.id))) continue
    if (!audios.every((a) => nachher.has(a.id))) continue
    const minuten = hoerMinuten(hoerBearbeitungszeit(audios.map((a) => ({ sekunden: nachher.get(a.id)!, plays: a.plays })), ablauf))
    if (minuten === p.minutes) continue
    meldungen.push(`${p.label || 'Hörverstehen'}: Bearbeitungszeit ${p.minutes} → ${minuten} Minuten (gemessene Aufnahme, ${ablauf.quelle})`)
    p.minutes = minuten
  }
  return meldungen
}
