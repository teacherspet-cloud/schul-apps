/**
 * Tafelbilder erzeugen und überarbeiten – als Hintergrund-Aufträge wie in den übrigen Programmen
 * (shared/auftraege.ts): sperren nichts, lassen sich abbrechen, landen als Rückgängig-Schritt.
 *
 * Ablauf beim Erzeugen:
 * 1. Material sammeln (hineingezogene Dateien, Material aus der App) – schon datenschutzgeprüft
 * 2. KI liefert Inhalt + Layoutvorschlag (prompt.ts)
 * 3. Zeichnungen auflösen: OpenMoji-Piktogramme suchen, KI-Bilder im Tafelstil erzeugen
 * 4. Layout je Format (layout.ts), Qualitätsprüfung (pruefung.ts)
 * 5. Zu viel Text oder Schrift unter der Empfehlung? Einmal kürzen lassen und neu setzen
 */
import type { StructuredRequest } from '@shared/types'
import { registriereFortsetzung, starteAuftrag, type AuftragsKontext } from '../../shared/auftraege'
import { stoffBilder } from '../../shared/files/stoffQuelle'
import type { WunschArt } from '../../shared/kiWunsch'
import { formatInfo, worteJeElement, type FormatId } from './formate'
import { knotenText, setzeLayout } from './layout'
import { kastenInhalt, kastenSatz } from './kasten'
import { elementText, type Befund, type Tafelbild, type TafelbildMeta, type TbElement, type TbInhalt, type TbTafel } from './model'
import {
  bildStil,
  elementAnfrage,
  elementAus,
  ganzesAnfrage,
  inhaltAnfrage,
  inhaltAus,
  inhaltsProbleme,
  korrekturAnfrage,
  korrekturAus,
  kuerzenAnfrage,
  kuerzenAus,
  type MaterialText
} from './prompt'
import { kleineSchrift, pruefeAlle, zuLangeKnoten } from './pruefung'
import { bibliothek } from './store'

type Melder = Pick<AuftragsKontext, 'melde' | 'ai' | 'bild'>

/** Texte und Bilder des Materials für die KI */
export function materialFuer(m: TafelbildMeta): { texte: MaterialText[]; bilder: string[] } {
  const texte: MaterialText[] = [
    ...m.stoffQuellen.filter((q) => q.aktiv && q.text.trim()).map((q) => ({ name: q.fileName, text: q.text })),
    ...m.appMaterial.filter((a) => a.aktiv && a.text.trim()).map((a) => ({ name: a.name, text: a.text }))
  ]
  // Beim Tafelfoto geht das Foto selbst immer mit; sonst höchstens sechs Seitenbilder
  return { texte, bilder: stoffBilder(m.stoffQuellen, m.modus === 'foto' ? 3 : 6) }
}

/** OpenMoji suchen und als data:-Adresse laden */
async function openMoji(suchwort: string): Promise<string | null> {
  const treffer = await window.api.images.searchOpenMoji(suchwort)
  const hex = treffer[0]?.hexcode
  if (!hex) return null
  const svg = await window.api.images.openMojiSvg(hex)
  return svg ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` : null
}

/** Zeichnungen mit Bildquelle auflösen; Fehler werden Befunde, kein Abbruch */
async function zeichnungenAufloesen(inhalt: TbInhalt, m: TafelbildMeta, k: Melder, befunde: Befund[]): Promise<TbInhalt> {
  const nurKreide = m.formate.every((f) => formatInfo(f).medium === 'kreide')
  const aus = structuredClone(inhalt)
  for (const z of aus.zeichnungen) {
    try {
      if (z.art === 'openmoji' && z.suchwort) {
        k.melde(`Piktogramm „${z.suchwort}" …`)
        const b = await openMoji(z.suchwort)
        if (b) z.bild = b
        else befunde.push({ art: 'bild', text: `Kein Piktogramm zu „${z.suchwort}" gefunden.` })
      } else if (z.art === 'kibild' && z.prompt) {
        k.melde('Die Bild-KI zeichnet im Tafelstil …')
        z.bild = await k.bild(bildStil(z.prompt, nurKreide))
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') throw e
      befunde.push({ art: 'bild', text: `Bild „${z.suchwort || z.prompt}" nicht erzeugt: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  // Ohne Bild bleibt eine Zeichnung nur, wenn sie selbst gezeichnet wird
  aus.zeichnungen = aus.zeichnungen.filter((z) => (z.art !== 'openmoji' && z.art !== 'kibild') || z.bild)
  return aus
}

export interface Ergebnis {
  inhalt: TbInhalt
  tafeln: TbTafel[]
  pruefung: Befund[]
}

/** Knoten der Elemente mit zu kleiner Schrift (alle Formate) */
const knotenMitKleinerSchrift = (tafeln: TbTafel[]): string[] =>
  [...new Set(tafeln.flatMap((t) => kleineSchrift(t).map((e) => e.knoten ?? '')))].filter(Boolean)

/**
 * Alle Formate setzen und prüfen; bei zu viel Text – oder wenn die Schrift unter die Empfehlung
 * fiele (Nachbesserung 30.09.2026) – einmal kürzen lassen: zuerst die zu langen Kästen, sonst die
 * mit zu kleiner Schrift, sonst alle.
 */
export async function setzeUndPruefe(inhalt: TbInhalt, m: TafelbildMeta, k: Melder | null, befunde: Befund[] = [], alteTafeln: TbTafel[] = []): Promise<Ergebnis> {
  const setzen = (i: TbInhalt): { tafeln: TbTafel[]; ueber: Befund[] } => {
    const ueber: Befund[] = []
    const tafeln = m.formate.map((f) => {
      const schrift = alteTafeln.find((t) => t.format === f)?.schrift
      const r = setzeLayout(i, f, { regler: m.regler, varianten: m.varianten, zeitachse: m.zeitachse, ...(schrift ? { schrift } : {}) })
      for (const t of r.ueberlauf) ueber.push({ format: f, art: 'text', text: t })
      return r.tafel
    })
    return { tafeln, ueber }
  }
  let aktuell = inhalt
  let r = setzen(aktuell)
  const lang = zuLangeKnoten(aktuell, m.grade, m.regler.stil)
  const klein = knotenMitKleinerSchrift(r.tafeln)
  if (k && (r.ueber.length || lang.length || klein.length)) {
    const ids = lang.length ? lang : klein.length ? klein : aktuell.knoten.map((x) => x.id)
    k.melde('Zu viel Text für die Tafel – die KI kürzt …')
    try {
      aktuell = kuerzenAus(await k.ai<unknown>(kuerzenAnfrage(m, aktuell, ids, worteJeElement(m.grade, m.regler.stil === 'ausformuliert'))), aktuell)
      r = setzen(aktuell)
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') throw e
    }
  }
  return { inhalt: aktuell, tafeln: r.tafeln, pruefung: pruefeAlle(r.tafeln, { grade: m.grade, regler: m.regler, inhalt: aktuell, lernziel: m.lernziel }, [...befunde, ...r.ueber]) }
}

async function erzeuge(t: Tafelbild, k: Melder, anfrage: (texte: MaterialText[], bilder: string[]) => StructuredRequest): Promise<Ergebnis> {
  const { texte, bilder } = materialFuer(t.meta)
  k.melde(t.meta.modus === 'foto' ? 'Die KI liest das Tafelfoto …' : texte.length || bilder.length ? 'Die KI wertet das Material aus …' : 'Die KI entwirft das Tafelbild …')
  const roh = await k.ai<unknown>(anfrage(texte, bilder))
  const befunde: Befund[] = []
  let inhalt = inhaltAus(roh, t.meta)
  inhalt = await korrigieren(inhalt, t.meta, k)
  inhalt = await zeichnungenAufloesen(inhalt, t.meta, k, befunde)
  k.melde('Layout und Prüfung …')
  return setzeUndPruefe(inhalt, t.meta, k, befunde, t.tafeln)
}

/**
 * Antwort der KI prüfen (Nachbesserung 30.09.2026): Fehlt einem Ereignis der Zeitleiste das Datum,
 * passt es nicht zum Titel oder hat eine Tabellenspalte nicht genau einen Eintrag je Aspekt, geht
 * EINE Korrekturanfrage mit genau diesen Fehlern an die KI. Was danach noch fehlt, meldet die Prüfung.
 */
async function korrigieren(inhalt: TbInhalt, m: TafelbildMeta, k: Melder): Promise<TbInhalt> {
  const probleme = inhaltsProbleme(inhalt)
  if (!probleme.length) return inhalt
  k.melde(inhalt.struktur === 'zeitleiste' ? 'Die KI ergänzt fehlende Daten der Zeitleiste …' : 'Die KI ordnet die Einträge den Spalten zu …')
  let neu = inhalt
  try {
    neu = korrekturAus(await k.ai<unknown>(korrekturAnfrage(m, inhalt, probleme)), inhalt)
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e
  }
  // Was danach noch fehlt, meldet die Prüfung (pruefeAlle)
  return neu
}

const titel = (t: Tafelbild): string => t.meta.title || t.meta.thema || t.inhalt?.titel || 'Tafelbild'

export function tafelbildErzeugen(t: Tafelbild, docId: string): void {
  void starteAuftrag({
    moduleId: 'tafelbild',
    docId,
    titel: titel(t),
    art: t.meta.modus === 'foto' ? 'Tafelfoto übernehmen' : 'Tafelbild erstellen',
    eingabe: t,
    fortsetzen: { art: 'tafelbild.erzeugen', args: [t, docId] },
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `tafelbild-${docId}`,
    fehlerTitel: 'Das Tafelbild konnte nicht erstellt werden',
    arbeit: (tb, k) => erzeuge(tb, k, (texte, bilder) => inhaltAnfrage(tb.meta, texte, bilder)),
    abschluss: (e) => `Tafelbild fertig – ${e.tafeln.length} Format${e.tafeln.length === 1 ? '' : 'e'}${e.pruefung.length ? `, ${e.pruefung.length} Hinweis${e.pruefung.length === 1 ? '' : 'e'}` : ''}.`,
    ablegen: (e, tb) => bibliothek.legeAb(docId, tb, (aktuell) => ({ ...aktuell, inhalt: e.inhalt, tafeln: e.tafeln, pruefung: e.pruefung }), 1)
  })
}

/** Zauberstab/Kreis für das ganze Tafelbild */
export function ganzesTafelbild(t: Tafelbild, docId: string, art: WunschArt, wunsch: string): void {
  const inhalt = t.inhalt
  if (!inhalt) return
  void starteAuftrag({
    moduleId: 'tafelbild',
    docId,
    titel: titel(t),
    art: art === 'neu' ? 'Tafelbild neu erzeugen' : 'Tafelbild überarbeiten',
    eingabe: t,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `tafelbild-${docId}`,
    fehlerTitel: 'Das Tafelbild konnte nicht überarbeitet werden',
    arbeit: (tb, k) => erzeuge(tb, k, (texte, bilder) => ganzesAnfrage(tb.meta, inhalt, art, wunsch, texte, bilder)),
    abschluss: () => (art === 'neu' ? 'Neu erzeugt.' : 'Überarbeitet.'),
    ablegen: (e, tb) => bibliothek.legeAb(docId, tb, (aktuell) => ({ ...aktuell, inhalt: e.inhalt, tafeln: e.tafeln, pruefung: e.pruefung }))
  })
}

/**
 * Nach einer Textänderung: Schrift so wählen, dass der Text in den Kasten passt (nicht unter die
 * Notfallschrift); reicht das nicht, wächst der Kasten nach unten.
 */
export function passeEin(e: TbElement, format: FormatId, schrift: TbTafel['schrift']): TbElement {
  if (e.typ !== 'kasten' && e.typ !== 'text' && e.typ !== 'merksatz') return e
  const f = formatInfo(format)
  const W = f.breite
  const H = f.hoehe
  const start = Math.max(e.schrift ?? f.schrift.text, f.schrift.notfall)
  let g = Math.min(start, f.schrift.text * (e.typ === 'text' && !e.titel ? 1.4 : 1))
  let s = kastenSatz(kastenInhalt(e), e.w * W, g * H, schrift)
  // Kleiner bis zur Notfallschrift; reicht das nicht, wächst der Kasten (höchstens bis zum Rand)
  while (s.hoehe > e.h * H && g > f.schrift.notfall) {
    g = Math.max(f.schrift.notfall, g * 0.94)
    s = kastenSatz(kastenInhalt(e), e.w * W, g * H, schrift)
  }
  return { ...e, schrift: g, h: Math.min(Math.max(e.h, s.hoehe / H), Math.max(e.h, 1 - e.y)) }
}

/** Zauberstab/Kreis an einem Element; der Text gilt in allen Formaten, die denselben Knoten zeigen */
export function elementBearbeiten(t: Tafelbild, docId: string, format: FormatId, elementId: string, art: WunschArt, wunsch: string): void {
  const tafel = t.tafeln.find((x) => x.format === format)
  const e = tafel?.elemente.find((x) => x.id === elementId)
  if (!tafel || !e) return
  void starteAuftrag({
    moduleId: 'tafelbild',
    docId,
    titel: titel(t),
    art: `${art === 'neu' ? 'Neu erzeugen' : 'Überarbeiten'}: ${e.titel || elementText(e).slice(0, 30) || e.typ}`,
    eingabe: t,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `tafelbild-el-${docId}-${elementId}`,
    fehlerTitel: 'Das Element konnte nicht überarbeitet werden',
    arbeit: async (tb, k) => {
      if ((e.typ === 'bild' || (e.typ === 'symbol' && e.bild)) && e.bildQuelle === 'ki') {
        k.melde('Die Bild-KI zeichnet neu …')
        const prompt = [e.bildPrompt || e.text || tb.meta.thema, wunsch].filter(Boolean).join('. ')
        return { bild: await k.bild(bildStil(prompt, formatInfo(format).medium === 'kreide')), prompt }
      }
      k.melde('Die KI überarbeitet das Element …')
      return { antwort: elementAus(await k.ai<unknown>(elementAnfrage(tb.meta, e, tafel.elemente, art, wunsch)), e) }
    },
    abschluss: () => 'Element überarbeitet.',
    ablegen: (erg, tb) =>
      bibliothek.legeAb(docId, tb, (aktuell) => {
        const neu = structuredClone(aktuell)
        for (const tf of neu.tafeln) {
          tf.elemente = tf.elemente.map((x) => {
            const gleich = x.id === elementId || (e.knoten && x.knoten === e.knoten && x.typ === e.typ)
            if (!gleich) return x
            if ('bild' in erg) return { ...x, bild: erg.bild, bildPrompt: erg.prompt }
            const a = erg.antwort
            const geaendert: TbElement = {
              ...x,
              ...(a.titel !== undefined && x.titel !== undefined ? { titel: a.titel } : {}),
              text: a.text,
              lueckenWoerter: a.lueckenWoerter,
              ...(a.symbol && x.typ === 'kasten' ? { symbol: a.symbol } : {}),
              ...(a.tex && x.typ === 'formel' ? { tex: a.tex } : {}),
              ...(a.diagramm && x.typ === 'diagramm' ? { diagramm: a.diagramm } : {})
            }
            return passeEin(geaendert, tf.format, tf.schrift)
          })
        }
        // Inhalt nachziehen (für späteres Neu-Setzen)
        if (neu.inhalt && e.knoten && !('bild' in erg)) {
          const kn = neu.inhalt.knoten.find((x) => x.id === e.knoten)
          if (kn) {
            if (erg.antwort.titel) kn.titel = erg.antwort.titel
            kn.punkte = erg.antwort.text.split('\n').map((z) => z.replace(/^[•\-–]\s*/, '').trim()).filter(Boolean)
            kn.lueckenWoerter = erg.antwort.lueckenWoerter
          }
        }
        if (neu.inhalt && e.typ === 'merksatz' && neu.inhalt.merksatz && !('bild' in erg)) {
          neu.inhalt.merksatz = { ...neu.inhalt.merksatz, text: erg.antwort.text, lueckenWoerter: erg.antwort.lueckenWoerter }
        }
        neu.pruefung = pruefeAlle(neu.tafeln, { grade: neu.meta.grade, regler: neu.meta.regler, inhalt: neu.inhalt, lernziel: neu.meta.lernziel })
        return neu
      })
  })
}

/** Knoten, aus denen die Elemente entstanden (alle Formate) */
export const knotenVon = (t: Tafelbild, elementIds: string[]): string[] =>
  [...new Set(t.tafeln.flatMap((x) => x.elemente.filter((e) => elementIds.includes(e.id)).map((e) => e.knoten ?? '')))].filter(Boolean)

/**
 * „Text kürzen (KI)" – Vorschlag der App zum Befund „Schrift kleiner als empfohlen": die Kästen der
 * betroffenen Knoten kürzen lassen (ohne Zuordnung: alle), dann alle Formate neu setzen. Als
 * Hintergrund-Auftrag, ein Rückgängig-Schritt.
 */
export function textKuerzen(t: Tafelbild, docId: string, knotenIds: string[]): void {
  const inhalt = t.inhalt
  if (!inhalt) return
  const bekannt = knotenIds.filter((id) => inhalt.knoten.some((k) => k.id === id))
  const ids = bekannt.length ? bekannt : inhalt.knoten.map((x) => x.id)
  void starteAuftrag({
    moduleId: 'tafelbild',
    docId,
    titel: titel(t),
    art: 'Text kürzen',
    eingabe: t,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `tafelbild-${docId}`,
    fehlerTitel: 'Der Text konnte nicht gekürzt werden',
    arbeit: async (tb, k) => {
      k.melde('Die KI kürzt die Kästen …')
      const gekuerzt = kuerzenAus(
        await k.ai<unknown>(kuerzenAnfrage(tb.meta, inhalt, ids, worteJeElement(tb.meta.grade, tb.meta.regler.stil === 'ausformuliert'))),
        inhalt
      )
      k.melde('Layout und Prüfung …')
      return setzeUndPruefe(gekuerzt, tb.meta, null, [], tb.tafeln)
    },
    abschluss: (e) =>
      `Gekürzt${e.pruefung.some((b) => b.art === 'schrift') ? ' – die Schrift ist noch klein.' : ' – die Schrift hat wieder die empfohlene Größe.'}`,
    ablegen: (e, tb) => bibliothek.legeAb(docId, tb, (aktuell) => ({ ...aktuell, inhalt: e.inhalt, tafeln: e.tafeln, pruefung: e.pruefung }))
  })
}

/** Layout aller Formate aus dem Inhalt neu setzen (ohne KI) – eigene Änderungen an der Lage gehen dabei verloren */
export async function neuSetzen(t: Tafelbild): Promise<Tafelbild> {
  if (!t.inhalt) return t
  const e = await setzeUndPruefe(t.inhalt, t.meta, null, [], t.tafeln)
  return { ...t, tafeln: e.tafeln, pruefung: e.pruefung }
}

/** Nach dem Bearbeiten: Knoten-Texte aus den Kästen zurück in den Inhalt (für späteres Neu-Setzen) */
export function inhaltAusKaesten(inhalt: TbInhalt, tafel: TbTafel, stil: TafelbildMeta['regler']['stil']): TbInhalt {
  const neu = structuredClone(inhalt)
  for (const k of neu.knoten) {
    const e = tafel.elemente.find((x) => x.knoten === k.id && x.typ === 'kasten')
    if (!e || e.text === knotenText(k, stil)) continue
    k.titel = e.titel ?? k.titel
    k.punkte = e.text.split('\n').map((z) => z.replace(/^[•\-–]\s*/, '').trim()).filter(Boolean)
  }
  return neu
}

// Nach einem Neustart der iPad-App fortsetzen (shared/auftraege.ts)
registriereFortsetzung('tafelbild.erzeugen', tafelbildErzeugen)
