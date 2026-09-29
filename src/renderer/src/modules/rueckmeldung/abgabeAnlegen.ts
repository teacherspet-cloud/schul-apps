/**
 * Abgaben lesen, anlegen und vom Aufgabentext trennen – gemeinsam für „Einrichten" (viele Dateien
 * auf einmal) und das Fenster „Weitere Abgabe" in „Bögen & Export" (29.09.2026 nachts, Wunsch der
 * Lehrkraft: „eine weitere Abgabe einfügen und auswerten lassen").
 *
 * Der Weg ist in beiden Fällen derselbe: Datei lesen (Foto, Scan, PDF, Word, Text), Word-HTML zu
 * Text, unsichtbaren KI-Test entfernen, Datenschutz prüfen (Hinweis, Namen ersetzen), Abgabe mit
 * dem nächsten Kürzel anlegen, Aufgabenstellung und Material abtrennen (erst Abgleich mit der
 * Aufgabe, bei Verdacht die KI).
 */
import { laeuft, useAuftraege } from '../../shared/auftraege'
import { pruefeHochladen, type HochladeInhalt } from '../../shared/datenschutz'
import { extractContent } from '../../shared/files/extractContent'
import { newId } from '../vokabeltest/model/random'
import { kiTrennungNoetig, klartext, ohneKiTest, trenneNachAufgabe, trennungAnwenden } from './abgabeTrennen'
import { abgabenTrennen } from './auftrag'
import { naechstesKuerzel, type Abgabe, type Rueckmeldung } from './model/types'
import { useRueckmeldung } from './store'

type Aendern = (fn: (d: Rueckmeldung) => void, gruppe?: string) => void

/**
 * Dateien lesen und den Datenschutz prüfen, bevor etwas zur KI geht. `melde` zeigt den Fortschritt
 * (null = fertig). Liefert null, wenn die Lehrkraft den Hinweis abbricht.
 */
export async function abgabenLesen(files: File[], melde: (text: string | null) => void): Promise<HochladeInhalt[] | null> {
  const gelesen: HochladeInhalt[] = []
  for (const f of files) {
    melde(`${f.name} wird gelesen …`)
    const c = await extractContent(f, (m) => melde(`${f.name}: ${m}`), { renderPages: false, maxRenderedPages: 4 })
    // Word kommt als HTML: nur der Text, ohne Tags und eingebettete Bilder; der unsichtbare KI-Test fällt weg
    gelesen.push({ fileName: c.fileName, text: c.kind === 'image' ? '' : ohneKiTest(klartext(c.text)).text, kind: c.kind, pageImages: c.pageImages })
  }
  melde(null)
  // Datenschutz: Hinweis und Namen ersetzen, bevor etwas zur KI geht
  return pruefeHochladen(gelesen)
}

/** Eine neue Abgabe aus gelesenem Inhalt (Text oder – bei Scans ohne Textebene – die Seitenbilder) */
export function neueAbgabe(abgaben: Abgabe[], g: Pick<HochladeInhalt, 'fileName' | 'text' | 'pageImages' | 'pseudonyme'>, extra: Partial<Pick<Abgabe, 'name' | 'ausgleich'>> = {}): Abgabe {
  const text = g.text.trim()
  return {
    id: newId(),
    kuerzel: naechstesKuerzel(abgaben),
    name: extra.name?.trim() ?? '',
    dateiname: g.fileName,
    text,
    // Gescannte PDFs ohne Textebene: Die Seiten werden übertragen
    bilder: text ? [] : (g.pageImages ?? []),
    ...(g.pseudonyme?.length ? { pseudonyme: g.pseudonyme } : {}),
    ...(extra.ausgleich ? { ausgleich: extra.ausgleich } : {})
  }
}

/** Gelesene Dateien als Abgaben anlegen – je Datei eine. Liefert die neuen Kennungen und die mit Text */
export function abgabenAnlegen(update: Aendern, geprueft: HochladeInhalt[], extra: Partial<Pick<Abgabe, 'name' | 'ausgleich'>> = {}): { ids: string[]; mitText: string[] } {
  const ids: string[] = []
  const mitText: string[] = []
  update((d) => {
    for (const g of geprueft) {
      const neu = neueAbgabe(d.abgaben, g, extra)
      d.abgaben.push(neu)
      ids.push(neu.id)
      if (neu.text) mitText.push(neu.id)
    }
  })
  return { ids, mitText }
}

/**
 * Schülertext vom Aufgabentext trennen (29.09.2026, Fehlerbericht der Lehrkraft): erst Abgleich mit
 * der Aufgabe, dann – bei Verdacht auf weitere Aufgabenteile oder ohne Aufgabe – die KI. Mit
 * `erneut` (Knopf) fragt die App die KI auch dann, wenn der Abgleich nichts gefunden hat.
 * Liefert true, wenn die KI noch trennt (Auftrag läuft).
 */
export function aufgabentextAbtrennen(update: Aendern, docId: string, ids: string[], erneut = false): boolean {
  const kiIds: string[] = []
  update((d) => {
    d.abgaben.forEach((x, j) => {
      if (!ids.includes(x.id) || !x.text.trim()) return
      const e = trenneNachAufgabe(x.text, d.grundlage.aufgaben, d.grundlage.erwartung)
      d.abgaben[j] = trennungAnwenden(x, e, 'abgleich')
      if (kiTrennungNoetig(e, d.grundlage.aufgaben) || (erneut && !e.zeilen)) kiIds.push(x.id)
    })
  })
  const aktuell = useRueckmeldung.getState().dok
  if (!aktuell || !kiIds.length) return false
  abgabenTrennen(aktuell, docId, kiIds)
  return true
}

/** Warten, bis kein Auftrag mit diesem Schlüssel mehr läuft (höchstens `maxMs`) */
export function warteAufAuftrag(docId: string, schluessel: string, maxMs = 180000): Promise<void> {
  const offen = (): boolean => useAuftraege.getState().auftraege.some((a) => a.docId === docId && a.schluessel === schluessel && laeuft(a))
  return new Promise((fertig) => {
    // Ein eben gestarteter Auftrag steht erst nach einem Takt in der Liste
    setTimeout(() => {
      if (!offen()) return fertig()
      const zeit = setTimeout(() => {
        ab()
        fertig()
      }, maxMs)
      const ab = useAuftraege.subscribe(() => {
        if (offen()) return
        clearTimeout(zeit)
        ab()
        fertig()
      })
    }, 0)
  })
}

/** Schlüssel des Trenn-Auftrags (auftrag.ts `abgabenTrennen`) */
export const trennSchluessel = (docId: string): string => `rueckmeldung-trennen-${docId}`
