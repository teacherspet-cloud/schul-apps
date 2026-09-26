/**
 * Die Erzeugungsschritte des Arbeitsblatts als Hintergrund-Aufträge (shared/auftraege.ts).
 *
 * Vorher liefen sie in TopicStep und OutlineStep hinter einem Fenster ohne Schließen-Knopf,
 * und das Ergebnis landete im gerade offenen Blatt. Jetzt arbeitet jeder Auftrag mit einer
 * Kopie des Blattes vom Start und legt das Ergebnis im SELBEN Blatt ab – auch wenn die
 * Lehrkraft inzwischen ein neues angefangen hat.
 *
 * Die Erzeugung selbst (generate.ts, finish.ts) ist unverändert – auch die Reparaturen am Ende
 * (Hörverstehen verknüpfen, Quellen prüfen, Bilder, Tafelbild) laufen wie bisher. Nur WER sie
 * aufruft und WOHIN das Ergebnis geht, hat sich geändert.
 */
import { istAbbruch } from '@shared/abbruch'
import { starteAuftrag } from '../../shared/auftraege'
import { notifyInfo } from '../../shared/util'
import { blattOffen, legeArbeitsblattAb } from './library'
import { browserWorksheetImageDeps } from './generation/browserImages'
import { finishWorksheet } from './generation/finish'
import { generateOutline, generateWorksheet } from './generation/generate'
import { alsAblage, beschaffeOriginalmaterial, materialSprache, type GepruefterTreffer } from './generation/originalmaterial'
import { browserMaterialDienste, browserSourceServices } from './generation/originalSources'
import { originalSourcesActive, sourceTextWords } from './generation/prompts'
import { subjectById } from './model/subjects'
import type { Worksheet, WsBlock } from './model/types'
import { profileFromMeta } from './render/SheetPages'
import type { AuftragsKontext } from '../../shared/auftraege'
import { foxPrompt } from './render/coverDesigns'
import { tierPrompt } from './render/maskottchen'
import { pruefeBlattNeu } from './generation/generate'
import { repariereBausteine } from './generation/reparatur'
import { systemPrompt, taskContext } from './generation/prompts'
import { anredeFuerMeta } from './didactics/anrede'
import { anredeRegel } from '../../shared/anrede'
import { lerngruppeSatz, ohneHinweise, wendeReparaturAn } from '../../shared/kiBeheben'
import type { WorksheetMeta } from './model/types'

const titelVon = (ws: Worksheet): string => ws.meta.title.trim() || ws.meta.topic.trim() || 'Arbeitsblatt'

/** Art der Rückfrage „welche Quelle?" (Sek II) – ArbeitsblattModule zeigt dazu die Trefferliste */
export const QUELLENAUSWAHL = 'quellenauswahl'
export interface QuellenFrage {
  treffer: GepruefterTreffer[]
  thema: string
}

/**
 * Originalmaterial beschaffen, bevor geplant wird.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Hier soll die KI im Hintergrund nach geeigneten
 * Originalmaterialien im Internet suchen."
 *
 * VOR der Gliederung, nicht danach: Die Aufgaben müssen zu dem Text passen, der wirklich
 * gefunden wurde. Plant man erst und sucht dann, entstehen Aufgaben zu einem gedachten Text
 * – und die Lehrkraft merkt es erst beim Lesen.
 */
async function materialBeschaffen(ws: Worksheet, k: AuftragsKontext) {
  const meta = ws.meta
  if (!originalSourcesActive(meta)) return null
  const ergebnis = await beschaffeOriginalmaterial({
    wunsch: {
      thema: meta.topic,
      fach: meta.subjectLabel,
      fachId: meta.subjectId,
      // Sprachmittlung geht vom DEUTSCHEN Ausgangstext aus – sonst faellt die gepruefte Leistung weg
      sprache: materialSprache(subjectById(meta.subjectId), meta.skillFocus === 'mediation'),
      jahrgang: meta.grade,
      zielWortzahl: sourceTextWords(meta),
      // Arbeitsblätter dürfen ausweichen, Klausuren nicht – entschieden am 24.09.2026
      pruefung: false
    },
    dienste: browserMaterialDienste(k.websuche),
    ai: k.ai,
    fortschritt: (text) => k.melde(text),
    /*
     * Ab Jahrgang 11 wählt die Lehrkraft: Dort ist die Quelle selbst Gegenstand des Unterrichts.
     * Die Frage wartet im Auftrag; die Trefferliste erscheint, sobald das Blatt offen ist
     * (in der Auftragsleiste: „Auswahl treffen").
     */
    auswahl: meta.grade >= 11 ? (treffer) => k.frage<string | null>(QUELLENAUSWAHL, { treffer, thema: meta.topic } satisfies QuellenFrage) : undefined
  })
  if (ergebnis.art === 'gefunden') return alsAblage(ergebnis.material)
  /*
   * Kein Fund heißt nicht „Fehler". Das Blatt entsteht mit einem als Autorentext
   * erkennbaren Text – aber die Lehrkraft erfährt, woran es lag, statt sich zu wundern,
   * warum keine Quelle darauf steht.
   */
  notifyInfo(`Kein Originaltext übernommen: ${ergebnis.grund} Das Blatt entsteht mit einem eigenen Text.`)
  return null
}

/** Schritt 1 → 2: Gliederung planen (mit Materialsuche). */
export function planeGliederung(worksheet: Worksheet, docId: string): void {
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: titelVon(worksheet),
    art: 'Gliederung planen',
    eingabe: worksheet,
    istOffen: () => blattOffen(docId),
    fehlerTitel: 'Gliederung konnte nicht erstellt werden',
    arbeit: async (ws, k) => {
      const material = await materialBeschaffen(ws, k).catch((e) => {
        if (istAbbruch(e) || k.signal.aborted) throw e
        notifyInfo(`Die Materialsuche ist fehlgeschlagen (${e instanceof Error ? e.message : String(e)}). Das Blatt entsteht mit einem eigenen Text.`)
        return null
      })
      k.melde('Die KI plant Lernziele, Bausteine und Aufgaben passend zur Lerngruppe …')
      const outline = await generateOutline(ws.meta, profileFromMeta(ws.meta), ws.sources, k.ai, material)
      return { outline, material }
    },
    // Ersetzt wird nur, was geplant wurde; Titel nur, wenn noch keiner dasteht
    ablegen: ({ outline, material }, ws) =>
      legeArbeitsblattAb(
        docId,
        ws,
        (aktuell) => ({
          ...aktuell,
          outline,
          originalMaterial: material ?? undefined,
          meta: { ...aktuell.meta, title: aktuell.meta.title || outline.title, teacherNote: outline.teacherNote }
        }),
        1
      )
  })
}

/**
 * „Neu planen" in der Gliederung – mit dem Originalmaterial, das beim ersten Planen gefunden
 * wurde. Vorher fehlte es hier: Die neue Gliederung plante Aufgaben zu einem gedachten Text,
 * obwohl ein echter bereitlag. Die alte Gliederung bleibt über Strg+Z erreichbar.
 */
export function planeNeu(worksheet: Worksheet, docId: string): void {
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: titelVon(worksheet),
    art: 'Gliederung neu planen',
    eingabe: worksheet,
    istOffen: () => blattOffen(docId),
    fehlerTitel: 'Gliederung konnte nicht neu geplant werden',
    arbeit: (ws, k) => {
      k.melde('Die KI plant die Gliederung neu …')
      return generateOutline(ws.meta, profileFromMeta(ws.meta), ws.sources, k.ai, ws.originalMaterial ?? null)
    },
    ablegen: (outline, ws) => legeArbeitsblattAb(docId, ws, (aktuell) => ({ ...aktuell, outline }), 1)
  })
}

/**
 * Schritt 2 → 3: Arbeitsblatt ausformulieren und fertigstellen (Quellen, Bilder, Tafelbild).
 * Bleibt dasselbe Dokument wie der Entwurf; Strg+Z führt zur Gliederung zurück.
 */
export function formuliereAus(worksheet: Worksheet, docId: string, optionen: { review: boolean; economy: boolean }): void {
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: titelVon(worksheet),
    art: 'Arbeitsblatt ausformulieren',
    eingabe: worksheet,
    istOffen: () => blattOffen(docId),
    fehlerTitel: 'Arbeitsblatt konnte nicht erstellt werden',
    arbeit: async (ws, k) => {
      const profile = profileFromMeta(ws.meta)
      // Die inhaltliche Prüfung läuft auch im Sparmodus: Ein Blatt mit falschen Verweisen
      // oder unlösbaren Aufgaben spart kein Kontingent, sondern kostet Unterrichtszeit.
      const result = await generateWorksheet(ws, profile, {
        ai: k.ai,
        review: optionen.review,
        combined: optionen.economy,
        onProgress: (message, done, total) => k.melde(message, done, total, 'formulate')
      })
      await finishWorksheet(
        result,
        profile,
        { ai: k.ai, images: await browserWorksheetImageDeps({ ai: k.ai, bild: k.bild }), sources: browserSourceServices() },
        (message, done, total) => k.melde(message, done, total, 'finish')
      )
      return result
    },
    /*
     * Das ausformulierte Blatt ersetzt den Stand vollständig: Es wurde aus genau diesem Stand
     * erzeugt, und während des Laufs war das Blatt gesperrt. Ist es offen, geht es als ein
     * Rückgängig-Schritt hinein.
     */
    ablegen: (result, ws) => legeArbeitsblattAb(docId, ws, () => result, 2)
  })
}

/** Ändert den Baustein `blockId` in jedem Blatt, das ihn hat (Gruppenfassungen teilen Material). */
export function aendereBaustein(ws: Worksheet, blockId: string, fn: (b: WsBlock) => WsBlock): Worksheet {
  return {
    ...ws,
    sheets: ws.sheets.map((s) => (s.blocks.some((b) => b.id === blockId) ? { ...s, blocks: s.blocks.map((b) => (b.id === blockId ? fn(b) : b)) } : s))
  }
}

/**
 * Ein einzelner Baustein (überarbeiten, füllen, Beispiel): ein kleiner Auftrag, der das Blatt
 * NICHT sperrt. Er erscheint in der Auftragsleiste, lässt sich abbrechen und ändert am Ende nur
 * seinen eigenen Baustein – im offenen Blatt als Rückgängig-Schritt, sonst in der Bibliothek.
 * Vorher schrieb er in das gerade offene Blatt; war das inzwischen ein anderes, ging das
 * Ergebnis verloren.
 */
export function bausteinAuftrag(
  worksheet: Worksheet,
  docId: string,
  art: string,
  schluessel: string,
  blockId: string,
  arbeit: (ws: Worksheet, k: AuftragsKontext) => Promise<(b: WsBlock) => WsBlock>
): void {
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: titelVon(worksheet),
    art,
    eingabe: worksheet,
    istOffen: () => blattOffen(docId),
    sperrt: false,
    schluessel,
    fehlerTitel: `${art} fehlgeschlagen`,
    arbeit,
    abschluss: () => 'Fertig – im Blatt übernommen',
    ablegen: (aendern, ws) => legeArbeitsblattAb(docId, ws, (aktuell) => aendereBaustein(aktuell, blockId, aendern))
  })
}

/**
 * Maskottchen des Deckblatts neu zeichnen lassen (Fuchs oder anderes Tier, Paket 11).
 *
 * Vorher wartete der Editor auf das Bild (`await window.api.ai.image`), ohne Abbrechen und
 * ohne Anzeige in der Auftragsleiste. Jetzt ein kleiner Auftrag wie beim Überarbeiten eines
 * Bausteins: sperrt nichts, lässt sich abbrechen und legt das Bild im SELBEN Blatt ab – als
 * Rückgängig-Schritt, falls es offen ist. Nur auf Knopfdruck: Ein KI-Bild kostet spürbar
 * Kontingent, und das Deckblatt steht auch mit der mitgelieferten Zeichnung.
 */
export function maskottchenZeichnen(worksheet: Worksheet, docId: string): void {
  const tier = worksheet.meta.coverMascot === 'tier'
  const welches = worksheet.meta.coverAnimal ?? 'eule'
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: titelVon(worksheet),
    art: tier ? 'Deckblatt-Tier zeichnen' : 'Deckblatt-Fuchs zeichnen',
    eingabe: worksheet,
    istOffen: () => blattOffen(docId),
    sperrt: false,
    schluessel: 'deckblatt-maskottchen',
    fehlerTitel: 'Das Bild konnte nicht erzeugt werden',
    arbeit: (ws, k) => {
      k.melde('Die Bild-KI zeichnet das Maskottchen …')
      return k.bild(tier ? tierPrompt(welches, ws.meta.subjectLabel, ws.meta.topic) : foxPrompt(ws.meta.subjectLabel, ws.meta.topic))
    },
    abschluss: () => 'Fertig – auf dem Deckblatt übernommen',
    ablegen: (bild, ws) =>
      legeArbeitsblattAb(docId, ws, (aktuell) => ({
        ...aktuell,
        // Das Tier gehört zu der Art, die beim Start gewählt war – nicht zu einer inzwischen anderen
        meta: tier ? { ...aktuell.meta, coverAnimal: welches, coverAnimalImage: bild } : { ...aktuell.meta, coverImage: bild }
      }))
  })
}

/** Ein Hinweis, der behoben werden soll – mit dem Baustein, an dem er hängt (fehlt bei Hinweisen zum ganzen Blatt) */
export interface BehebHinweis {
  text: string
  blockId?: string
}

/** Lerngruppe und Lernziel eines Blattes für den Reparaturauftrag */
export function reparaturKontextAus(meta: WorksheetMeta, lernziele: string[] = []): { lerngruppe: string; lernziel: string } {
  return {
    lerngruppe: lerngruppeSatz({ fach: meta.subjectLabel, jahrgang: meta.grade, schulform: meta.schoolTypeName, niveau: meta.cefrLevel || undefined }),
    lernziel: [meta.topic, ...lernziele].filter((x) => x?.trim()).join('; ')
  }
}

/**
 * „Mit KI beheben" am Arbeitsblatt (Paket 12): ein kleiner Auftrag, der das Blatt nicht sperrt.
 * Die KI bekommt den Hinweis mit Baustein, Blatt, Lernziel, Lerngruppe und Anrede-Regel und
 * liefert eine gezielte Reparatur (generation/reparatur.ts). Abgelegt wird sie als EIN
 * Rückgängig-Schritt – danach laufen die lokalen Prüfungen des Blattes neu.
 */
export function hinweiseBeheben(worksheet: Worksheet, docId: string, sheetId: string, hinweise: BehebHinweis[]): void {
  if (!hinweise.length || !worksheet.sheets.some((s) => s.id === sheetId)) return
  // Hinweise zum ganzen Blatt („[Blatt] …") hängen nur am ersten Baustein – sie gehören zu keinem bestimmten
  const ziel = hinweise.length === 1 && !hinweise[0].text.startsWith('[Blatt]') ? hinweise[0].blockId : undefined
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: titelVon(worksheet),
    art: hinweise.length > 1 ? `${hinweise.length} Hinweise mit KI beheben` : 'Hinweis mit KI beheben',
    eingabe: worksheet,
    istOffen: () => blattOffen(docId),
    sperrt: false,
    // Am Baustein dreht sich dann sein Ladezeichen; Hinweise zum ganzen Blatt haben einen eigenen Schlüssel
    schluessel: ziel ?? `beheben-${sheetId}`,
    fehlerTitel: 'Der Hinweis ließ sich nicht beheben',
    arbeit: async (ws, k) => {
      k.melde('Die KI behebt den Hinweis …')
      const blatt = ws.sheets.find((x) => x.id === sheetId)!
      const profile = profileFromMeta(ws.meta)
      const anrede = anredeFuerMeta(ws.meta)
      const nummer = ziel ? blatt.blocks.findIndex((b) => b.id === ziel) + 1 : 0
      return repariereBausteine(
        {
          bloecke: blatt.blocks,
          hinweise: hinweise.map((h) => h.text),
          kontext: {
            material: 'Arbeitsblatt',
            ...reparaturKontextAus(ws.meta, ws.outline?.learningGoals),
            ort: ws.sheets.length > 1 ? blatt.label : undefined,
            anredeRegel: anredeRegel(anrede),
            bausteinNummer: nummer || undefined
          },
          system: systemPrompt(ws.meta, profile),
          zusatz: [taskContext(ws.meta, profile)],
          anrede,
          punkte: 'keine'
        },
        k.ai
      )
    },
    abschluss: (e) => (e.erklaerung ? `Behoben: ${e.erklaerung}` : 'Fertig – im Blatt übernommen'),
    ablegen: (e, ws) =>
      legeArbeitsblattAb(docId, ws, (aktuell) => ({
        ...aktuell,
        sheets: aktuell.sheets.map((s) =>
          s.id !== sheetId
            ? s
            : pruefeBlattNeu({ ...s, blocks: wendeReparaturAn(ohneHinweise(s.blocks, hinweise), e.aenderungen) }, profileFromMeta(aktuell.meta), aktuell.meta)
        )
      }))
  })
}
