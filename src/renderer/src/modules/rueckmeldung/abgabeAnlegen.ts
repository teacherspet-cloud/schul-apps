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
import { rotateImage } from '../../shared/util'
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

/** Nur Bilder (Fotos/Scans ohne Text)? Dann fragt die App, ob sie eine Abgabe oder mehrere sind (25.10.2026) */
export const nurBilder = (g: HochladeInhalt): boolean => !g.text.trim() && (g.pageImages?.length ?? 0) > 0

/**
 * Mehrere Bilder zu EINER Abgabe zusammenfassen (25.10.2026, Wunsch der Lehrkraft: zusammen hochgeladene Fotos sind oft
 * die Seiten EINER Arbeit). Dateien mit Text bleiben eigene Abgaben.
 */
export function bilderZusammenfassen(geprueft: HochladeInhalt[]): HochladeInhalt[] {
  const bilder = geprueft.filter(nurBilder)
  if (bilder.length < 2) return geprueft
  const erste = bilder[0]
  const eine: HochladeInhalt = {
    ...erste,
    fileName: `${erste.fileName} (+${bilder.length - 1})`,
    pageImages: bilder.flatMap((g) => g.pageImages ?? []),
    pseudonyme: bilder.flatMap((g) => g.pseudonyme ?? [])
  }
  // Reihenfolge: die eine Abgabe an der Stelle des ersten Bildes
  let eingesetzt = false
  return geprueft.flatMap((g) => (nurBilder(g) ? (eingesetzt ? [] : ((eingesetzt = true), [eine])) : [g]))
}

/** Gelesene Dateien als Abgaben anlegen – je Datei eine, oder alle Bilder als eine (`zusammen`). Liefert die neuen Kennungen und die mit Text */
export function abgabenAnlegen(update: Aendern, geprueft: HochladeInhalt[], extra: Partial<Pick<Abgabe, 'name' | 'ausgleich'>> = {}, zusammen = false): { ids: string[]; mitText: string[] } {
  const ids: string[] = []
  const mitText: string[] = []
  const liste = zusammen ? bilderZusammenfassen(geprueft) : geprueft
  update((d) => {
    for (const g of liste) {
      const neu = neueAbgabe(d.abgaben, g, extra)
      d.abgaben.push(neu)
      ids.push(neu.id)
      if (neu.text) mitText.push(neu.id)
    }
  })
  return { ids, mitText }
}

/** Eine Abgabe mit mehreren Seitenbildern in je eine Abgabe pro Seite zerlegen (an derselben Stelle) */
export function seitenTrennen(update: Aendern, id: string): void {
  update((d) => {
    const i = d.abgaben.findIndex((a) => a.id === id)
    const a = d.abgaben[i]
    if (!a || a.bilder.length < 2 || a.text.trim()) return
    const neue = a.bilder.map((b, n) => ({
      ...a,
      id: n === 0 ? a.id : newId(),
      kuerzel: n === 0 ? a.kuerzel : naechstesKuerzel([...d.abgaben, ...Array(n - 1).fill(a)]),
      name: n === 0 ? a.name : '',
      dateiname: `${a.dateiname.replace(/ \(\+\d+\)$/, '')} – Seite ${n + 1}`,
      bilder: [b]
    }))
    // Kürzel fortlaufend vergeben
    const vorhanden = d.abgaben.filter((x) => x.id !== id)
    neue.forEach((x, n) => {
      if (n > 0) x.kuerzel = naechstesKuerzel([...vorhanden, ...neue.slice(0, n)])
    })
    d.abgaben.splice(i, 1, ...neue)
  })
}

/** Abgabe an die vorherige anhängen (Seitenbilder) – z. B. versehentlich getrennte Seiten einer Arbeit */
export function mitVorherigerZusammenlegen(update: Aendern, id: string): void {
  update((d) => {
    const i = d.abgaben.findIndex((a) => a.id === id)
    if (i < 1) return
    const a = d.abgaben[i]
    const vorherige = d.abgaben[i - 1]
    if (a.text.trim() || vorherige.text.trim() || !a.bilder.length || !vorherige.bilder.length) return
    vorherige.bilder = [...vorherige.bilder, ...a.bilder]
    vorherige.dateiname = `${vorherige.dateiname.replace(/ \(\+\d+\)$/, '')} (+${vorherige.bilder.length - 1})`
    if (a.pseudonyme?.length) vorherige.pseudonyme = [...(vorherige.pseudonyme ?? []), ...a.pseudonyme]
    d.abgaben.splice(i, 1)
  })
}

/** Eine Seite drehen (90° links/rechts) – eingebrannt, damit KI und Export das gedrehte Bild sehen */
export async function seiteDrehen(update: Aendern, id: string, seite: number, grad: 90 | -90): Promise<void> {
  const d = useRueckmeldung.getState().dok
  const a = d?.abgaben.find((x) => x.id === id)
  const quelle = a?.bilder[seite] ?? a?.scans?.[seite]
  if (!quelle) return
  const gedreht = await rotateImage(quelle, grad)
  update((x) => {
    const z = x.abgaben.find((y) => y.id === id)
    if (!z) return
    if (z.bilder[seite]) z.bilder[seite] = gedreht
    if (z.scans?.[seite]) z.scans[seite] = gedreht
  })
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
