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
import { mitSehtext } from './didactics/sehtext'
import { versuchAnfrage, versuchAus } from './didactics/protokoll'
import type { VersuchDaten } from './model/protokoll'
import { istAbbruch } from '@shared/abbruch'
import { registriereFortsetzung, starteAuftrag } from '../../shared/auftraege'
import { notifyInfo } from '../../shared/util'
import { blattOffen, legeArbeitsblattAb } from './library'
import { browserWorksheetImageDeps } from './generation/browserImages'
import { finishWorksheet } from './generation/finish'
import { generateOutline, generateWorksheet } from './generation/generate'
import { alsAblage, beschaffeOriginalmaterial, materialSprache, type GepruefterTreffer } from './generation/originalmaterial'
import { browserMaterialDienste, browserSourceServices } from './generation/originalSources'
import { originalSourcesActive, sourceTextWords } from './generation/prompts'
import { schneideZu } from './generation/zuschnitt'
import { subjectById } from './model/subjects'
import type { TableBlock, TaskBlock, Worksheet, WsBlock } from './model/types'
import type { LearnerProfile } from './didactics/profile'
import { describeBlock } from './generation/describe'
import { newBlock } from './model/factory'
import { rasterAlsTabelle, rasterAnfrage, rasterAus } from '../../shared/bewertung/raster'
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
  /*
   * Eigene Internetadresse der Lehrkraft (01.10.2026): Sie wird nicht gesucht, sondern auf den
   * Umfang des Ausgangstextes zugeschnitten – wörtlich, mit Einleitungssatz und „(gekürzt)".
   */
  const eigene = ws.sources.find((q) => q.url && q.kind === 'web' && q.useAsBasis && q.text.trim())
  if (eigene?.url) {
    const woerter = sourceTextWords(meta)
    const fach = subjectById(meta.subjectId)
    const r = await schneideZu(
      {
        // Die Kopfzeilen „Webseite: …", „Adresse: …" sind Auskunft, kein Lesetext
        text: eigene.text.replace(/^\s*(?:(?:Webseite|Adresse|Titel):[^\n]*\n?)+\s*/i, ''),
        seitentitel: eigene.fileName,
        url: eigene.url,
        ziel: {
          min: Math.round(woerter * 0.85),
          max: Math.round(woerter * 1.25),
          grund: 'Umfang des Ausgangstextes aus Schritt 1 (Richtwert, bis ein Viertel mehr)'
        },
        thema: meta.topic,
        leitgedanke: meta.learningGoals,
        sprache: materialSprache(fach, meta.skillFocus === 'mediation'),
        ...(fach.foreignLanguage ? { zielsprache: fach.foreignLanguage } : {}),
        fach: meta.subjectLabel,
        jahrgang: meta.grade,
        mediation: meta.skillFocus === 'mediation'
      },
      k.ai,
      { netzsuche: browserMaterialDienste(k.websuche).netzsuche, fortschritt: (t) => k.melde(t) }
    )
    return r.ablage
  }
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
      pruefung: false,
      // Relevanzprüfung (01.10.2026): Lernziel und Sprachmittlung entscheiden mit, was passt
      lernziel: meta.learningGoals,
      mediation: meta.skillFocus === 'mediation'
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
    fortsetzen: {
      art: 'arbeitsblatt.planeGliederung',
      args: [worksheet, docId]
    },
    istOffen: () => blattOffen(docId),
    fehlerTitel: 'Gliederung konnte nicht erstellt werden',
    arbeit: planen,
    ablegen: (plan, ws) => legeArbeitsblattAb(docId, ws, (aktuell) => mitPlan(aktuell, plan), 1)
  })
}

type Kontext = AuftragsKontext
interface Plan {
  outline: NonNullable<Worksheet['outline']>
  material: Awaited<ReturnType<typeof materialBeschaffen>> | null
  versuch: VersuchDaten | null
}

/** Material, Versuch, Gliederung – Schritt 1 → 2 (auch Teil des Direktwegs im Standardmodus) */
async function planen(ws: Worksheet, k: Kontext): Promise<Plan> {
  const material = await materialBeschaffen(ws, k).catch((e) => {
    if (istAbbruch(e) || k.signal.aborted) throw e
    notifyInfo(`Die Materialsuche ist fehlgeschlagen (${e instanceof Error ? e.message : String(e)}). Das Blatt entsteht mit einem eigenen Text.`)
    return null
  })
  // Live-Vorschau: der gefundene Ausgangstext, während die Gliederung entsteht
  if (material) k.zeige({ material }, { was: `Material gefunden: „${material.titel}"` })
  // Versuch (29.09.2026): zuerst ausarbeiten, damit Gliederung und Aufgaben zu ihm passen
  const versuch = ws.meta.versuch?.aktiv && !ws.meta.versuch.daten ? await versuchAusarbeiten(ws.meta, k) : null
  // Hör-/Sehverstehen: ein Video aus dem Material wird zum Sehtext (02.10.2026, didactics/sehtext.ts)
  const meta = mitSehtext(versuch ? { ...ws.meta, versuch: { ...ws.meta.versuch!, daten: versuch } } : ws.meta, ws.sources)
  k.melde('Die KI plant Lernziele, Bausteine und Aufgaben passend zur Lerngruppe …')
  const outline = await generateOutline(meta, profileFromMeta(meta), ws.sources, k.ai, material)
  return { outline, material, versuch }
}

/** Ersetzt wird nur, was geplant wurde; Titel nur, wenn noch keiner dasteht */
function mitPlan(aktuell: Worksheet, { outline, material, versuch }: Plan): Worksheet {
  return {
    ...aktuell,
    outline,
    originalMaterial: material ?? undefined,
    meta: {
      ...aktuell.meta,
      ...(versuch && aktuell.meta.versuch ? { versuch: { ...aktuell.meta.versuch, daten: versuch } } : {}),
      title: aktuell.meta.title || outline.title,
      teacherNote: outline.teacherNote,
      // Überthema aus der Planung – nur, wenn die Lehrkraft keins gesetzt oder abgeschaltet hat
      ...(outline.ueberthema && !aktuell.meta.ueberthema?.trim() && !aktuell.meta.ueberthemaAus ? { ueberthema: outline.ueberthema } : {})
    }
  }
}

/**
 * Standardmodus (07.10.2026, abgestimmt): Schritt 1 → 3 in EINEM Auftrag – Gliederung planen und gleich
 * ausformulieren, ohne den Prüfschritt dazwischen. Die Gliederung bleibt im Blatt (Strg+Z bzw. Expertenmodus).
 */
export function erstelleDirekt(worksheet: Worksheet, docId: string, optionen: { review: boolean; economy: boolean }): void {
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: titelVon(worksheet),
    art: 'Arbeitsblatt erstellen',
    eingabe: worksheet,
    fortsetzen: {
      art: 'arbeitsblatt.erstelleDirekt',
      args: [worksheet, docId, optionen]
    },
    istOffen: () => blattOffen(docId),
    fehlerTitel: 'Arbeitsblatt konnte nicht erstellt werden',
    arbeit: async (ws, k) => ausformulieren(mitPlan(ws, await planen(ws, k)), k, optionen),
    ablegen: (result, ws) => legeArbeitsblattAb(docId, ws, () => result, 2)
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
    fortsetzen: { art: 'arbeitsblatt.planeNeu', args: [worksheet, docId] },
    istOffen: () => blattOffen(docId),
    fehlerTitel: 'Gliederung konnte nicht neu geplant werden',
    arbeit: (ws, k) => {
      k.melde('Die KI plant die Gliederung neu …')
      return generateOutline(ws.meta, profileFromMeta(ws.meta), ws.sources, k.ai, ws.originalMaterial ?? null)
    },
    ablegen: (outline, ws) =>
      legeArbeitsblattAb(
        docId,
        ws,
        (aktuell) => ({
          ...aktuell,
          outline,
          meta: {
            ...aktuell.meta,
            ...(outline.ueberthema && !aktuell.meta.ueberthema?.trim() && !aktuell.meta.ueberthemaAus ? { ueberthema: outline.ueberthema } : {})
          }
        }),
        1
      )
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
    fortsetzen: {
      art: 'arbeitsblatt.formuliereAus',
      args: [worksheet, docId, optionen]
    },
    istOffen: () => blattOffen(docId),
    fehlerTitel: 'Arbeitsblatt konnte nicht erstellt werden',
    arbeit: (eingabe, k) => ausformulieren(eingabe, k, optionen),
    /*
     * Das ausformulierte Blatt ersetzt den Stand vollständig: Es wurde aus genau diesem Stand
     * erzeugt, und während des Laufs war das Blatt gesperrt. Ist es offen, geht es als ein
     * Rückgängig-Schritt hinein.
     */
    ablegen: (result, ws) => legeArbeitsblattAb(docId, ws, () => result, 2)
  })
}

async function ausformulieren(eingabe: Worksheet, k: Kontext, optionen: { review: boolean; economy: boolean }): Promise<Worksheet> {
  // Hör-/Sehverstehen: ein Video aus dem Material wird zum Sehtext – samt Adresse für QR-Code und Link (didactics/sehtext.ts)
  const ws = { ...eingabe, meta: mitSehtext(eingabe.meta, eingabe.sources) }
  const profile = profileFromMeta(ws.meta)
  // Live-Vorschau: sofort das Blatt mit Platzhaltern je Gliederungspunkt (generateWorksheet) – die erste Antwort dauert oft über eine Minute
  // Die inhaltliche Prüfung läuft auch im Sparmodus: Ein Blatt mit falschen Verweisen
  // oder unlösbaren Aufgaben spart kein Kontingent, sondern kostet Unterrichtszeit.
  const result = await generateWorksheet(ws, profile, {
    ai: k.ai,
    review: optionen.review,
    combined: optionen.economy,
    onProgress: (message, done, total) => k.melde(message, done, total, 'formulate'),
    zwischenstand: (stand, was) => k.zeige(stand, { was })
  })
  k.zeige(result, { was: 'Ausformuliert – Quellen und Bilder folgen' })
  await finishWorksheet(
    result,
    profile,
    { ai: k.ai, images: await browserWorksheetImageDeps({ ai: k.ai, bild: k.bild }), sources: browserSourceServices() },
    (message, done, total) => k.melde(message, done, total, 'finish'),
    (stand, was) => k.zeige(stand, { was })
  )
  return result
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
    fortsetzen: { art: 'arbeitsblatt.maskottchen', args: [worksheet, docId] },
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

/**
 * Bewertungsraster zu einer Aufgabe (Großprogramm 0.4, F2): als Tabelle direkt hinter die
 * Aufgabe, voreingestellt nur im Lösungsteil. Gibt es schon ein Raster zu dieser Aufgabe
 * (Kennung `raster-<Aufgabe>`), wird es ersetzt.
 */
export function rasterAuftrag(worksheet: Worksheet, docId: string, aufgabe: TaskBlock, profile: LearnerProfile): void {
  const nummer = worksheet.sheets.flatMap((s) => s.blocks.filter((b) => b.type === 'task')).findIndex((b) => b.id === aufgabe.id) + 1
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: titelVon(worksheet),
    art: 'Bewertungsraster erstellen',
    eingabe: worksheet,
    istOffen: () => blattOffen(docId),
    sperrt: false,
    schluessel: `raster-${aufgabe.id}`,
    fehlerTitel: 'Bewertungsraster fehlgeschlagen',
    arbeit: async (ws, k) => {
      k.melde('Die KI entwirft das Bewertungsraster …')
      const antwort = await k.ai<unknown>(
        rasterAnfrage({
          system: systemPrompt(ws.meta, profile),
          aufgabe: describeBlock(aufgabe),
          loesung: aufgabe.solution,
          punkte: aufgabe.points ?? 0,
          aufteilung: rasterAufteilung(ws.meta.subjectId, Boolean(aufgabe.brief))
        })
      )
      return rasterAus(antwort, `Bewertungsraster${nummer ? ` zu Aufgabe ${nummer}` : ''}`, aufgabe.points ?? 0)
    },
    abschluss: () => 'Fertig – das Raster steht hinter der Aufgabe (im Lösungsteil)',
    ablegen: (raster, ws) =>
      legeArbeitsblattAb(docId, ws, (aktuell) => ({
        ...aktuell,
        sheets: aktuell.sheets.map((s) => {
          const i = s.blocks.findIndex((b) => b.id === aufgabe.id)
          if (i < 0) return s
          const id = `raster-${aufgabe.id}`
          const tabelle = { ...(newBlock('table') as TableBlock), id, ...rasterAlsTabelle(raster), nurLoesung: true }
          const blocks = s.blocks.filter((b) => b.id !== id)
          blocks.splice(blocks.findIndex((b) => b.id === aufgabe.id) + 1, 0, tabelle)
          return { ...s, blocks }
        })
      }))
  })
}

/** Inhalt/Sprache bzw. Inhalt/Darstellung nur bei Schreibaufgaben in Fremdsprachen und Deutsch */
export function rasterAufteilung(fach: string, schreibaufgabe: boolean): { inhalt: number; zweiter: 'Sprache' | 'Darstellung' } | undefined {
  if (!schreibaufgabe) return undefined
  if (fach === 'deutsch') return { inhalt: 70, zweiter: 'Darstellung' }
  if (subjectById(fach).foreignLanguage) return { inhalt: 40, zweiter: 'Sprache' }
  return undefined
}

/** Den Versuch der Karte „Versuch" ausarbeiten (29.09.2026, didactics/protokoll.ts) */
export async function versuchAusarbeiten(
  meta: WorksheetMeta,
  k: { melde: (m: string) => void; ai: <T>(req: import('@shared/types').StructuredRequest) => Promise<T> }
): Promise<VersuchDaten> {
  k.melde(meta.versuch?.quelle === 'datei' ? 'Die KI überträgt die Versuchsanleitung …' : 'Die KI arbeitet den Versuch aus …')
  return versuchAus(await k.ai<unknown>(versuchAnfrage(meta, meta.versuch!)))
}

/** „Versuch jetzt ausarbeiten" auf der Karte – zum Prüfen und Bearbeiten vor dem Planen */
export function versuchAuftrag(worksheet: Worksheet, docId: string): void {
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: titelVon(worksheet),
    art: 'Versuch ausarbeiten',
    eingabe: worksheet,
    fortsetzen: { art: 'arbeitsblatt.versuch', args: [worksheet, docId] },
    istOffen: () => blattOffen(docId),
    fehlerTitel: 'Der Versuch konnte nicht ausgearbeitet werden',
    arbeit: (ws, k) => versuchAusarbeiten(ws.meta, k),
    abschluss: (d) => `Versuch „${d.titel}" ausgearbeitet – Sicherheitsangaben bitte prüfen.`,
    ablegen: (daten, ws) =>
      legeArbeitsblattAb(docId, ws, (aktuell) =>
        aktuell.meta.versuch ? { ...aktuell, meta: { ...aktuell.meta, versuch: { ...aktuell.meta.versuch, daten } } } : aktuell
      )
  })
}

/*
 * Nach einem Neustart der iPad-App fortsetzen (30.09.2026, shared/auftraege.ts): dieselben
 * Eingaben, dieselben KI-Anfragen – was der PC schon gerechnet hat, kommt sofort zurück.
 */
registriereFortsetzung('arbeitsblatt.planeGliederung', planeGliederung)
registriereFortsetzung('arbeitsblatt.planeNeu', planeNeu)
registriereFortsetzung('arbeitsblatt.formuliereAus', formuliereAus)
registriereFortsetzung('arbeitsblatt.erstelleDirekt', erstelleDirekt)
registriereFortsetzung('arbeitsblatt.maskottchen', maskottchenZeichnen)
registriereFortsetzung('arbeitsblatt.versuch', versuchAuftrag)
