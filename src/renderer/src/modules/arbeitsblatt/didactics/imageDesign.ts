/**
 * Bilder auf Arbeitsblättern: Wann eines gehört, welche Art, wo es steht und wie es beschriftet wird.
 *
 * Grundlage ist eine Auswertung der lernpsychologischen Befundlage. Die wichtigsten Punkte,
 * aus denen hier Regeln werden:
 *
 * - **Bildfunktion schlägt Bildmenge.** Organisationale Bilder (Struktur, Ablauf, Anordnung)
 *   wirken mehr als doppelt so stark wie rein abbildende: Hedges' g = 0,52 gegenüber 0,24.
 *   Mehrere Bilder an derselben Aufgabe bringen aggregiert nichts (Hu, Chen, Li & Huang 2021,
 *   Educational Psychology Review, k = 51, N = 38.987).
 *
 * - **Schmuck schadet dosisabhängig, nicht ab dem ersten Bild.** Die aktuellste Metaanalyse
 *   findet g = −0,16 über 177 Effektstärken, vermittelt ausschließlich über sachfremde
 *   kognitive Last (Cheng, Wu, Wang & Wang 2026). Die Wirkung ist linear in der Menge
 *   (Wesenberg et al. 2026), und gedruckte Störelemente sind der ungünstige Fall, weil sie
 *   dauerhaft sichtbar bleiben (Sundararajan & Adesope 2020: g = 0,43 gegenüber 0,12 bei
 *   flüchtigen). Deshalb: höchstens eines, und nur unter den Bedingungen unten.
 *
 * - **Vier belegte Ausnahmen, unter denen Schmuck nicht schadet oder hilft:** thematische
 *   Bindung an den Inhalt (Scherer, Verkühlen & Dutke 2023: 83,4 % gegenüber 77,4 % richtige
 *   Antworten MIT Bild), positive affektive Tönung (Schneider, Dyrna, Meier, Beege & Rey 2018),
 *   Wiederauftauchen desselben Motivs in der Abfrage (Schneider, Nebel, Beege & Rey 2020 –
 *   dann kippt das Vorzeichen ins Positive) und geringe Dosis.
 *
 * - **Die eigentliche Gefahr ist indirekt:** Dekorative Bilder schaden nicht selbst, sie
 *   schwächen die Wirkung des daneben stehenden ERKLÄRENDEN Bildes – besonders bei Lernenden
 *   mit wenig Vorwissen (Lenzner, Schnotz & Müller 2013, Klasse 7/8).
 *
 * - **Beschriftung direkt am Bildelement ist der stärkste Hebel auf Papier.** Gegenüber einem
 *   Textabsatz darunter d = 0,80 bzw. 0,73; gegenüber einer Legende darunter noch d = 0,35
 *   (Johnson & Mayer 2012 an einer einzelnen statischen Darstellung). Arbiträre Buchstaben-
 *   oder Ziffernsysteme, deren Bedeutung anderswo steht, waren selbst für Studierende das
 *   schwerste Diagrammformat (Kottmeyer, Van Meter & Cameron 2020).
 *
 * - **Die Grundschule folgt anderen Regeln als die Erwachsenenforschung nahelegt.** Zwei
 *   gleichzeitig sichtbare Bilder senkten das Lernen, ein Hinweis darauf, welches gemeint ist,
 *   stellte es wieder her – die Bildgröße war dabei NICHT der wirksame Faktor, die Anzahl war es
 *   (Flack & Horst 2018). Viertklässler integrieren Text und Bild nicht von selbst (Mason,
 *   Tornatora & Pluchino 2013). Diagramme brachten ihnen gegenüber reinem Text minimalen bis
 *   keinen Mehrwert, ausgerechnet das „integrierte" Layout erzeugte Überlastung (Coleman,
 *   McTigue & Dantzler 2018, N = 213). Zählbare Objekte statt einfarbiger Flächen in einem
 *   Diagramm verhinderten den Strategieerwerb (Kaminski & Sloutsky 2013).
 *
 * - **Wenn das Lernziel Lesenlernen ist, verrät das Bild die Lösung.** Ein informatives Bild
 *   verschlechterte den Lesefortschritt von Leseanfängern gegenüber gar keinem Bild, weil es
 *   das Dekodieren überflüssig macht (Torcasio & Sweller 2010).
 *
 * - **Realitätsgrad richtet sich nach dem Lernziel, nicht nach dem Alter.** Dwyers vielzitierte
 *   These „realistisch schadet" hält der Metaanalyse nicht stand; Realismus und Farbe wirken
 *   überhaupt nur auf Begriffslernen, nicht auf Textverstehen (Reinwein & Huberdeau 1997).
 *   Schematische Darstellungen sind dann überlegen, wenn Information umgeformt oder übertragen
 *   werden muss (Skulmowski, Nebel, Remmele & Rey 2022).
 *
 * EHRLICHE LÜCKEN, die hier nicht überspielt werden: Es gibt keine empirischen Normwerte für
 * Bilder pro Seite oder für den Bildanteil an der Seitenfläche, und keine Evidenz zur optimalen
 * Bildgröße. Alle Mengenangaben unten sind als Faustregel gekennzeichnet und bewusst an der
 * Anzahl orientiert, nicht an der Größe – das ist die einzige Dimension, zu der es Befunde gibt.
 */
import { loeseMaterialverweise, type IntegrityFinding } from './integrity'
import type { ImageBlock, ImageRole, Sheet, WorksheetMeta, WsBlock } from '../model/types'
import { bildmasse, bildzugriff, mindestbreite } from './bildarbeit'
import { seitenBereich, seitenText, seitenVorgabe } from './seiten'
import { verwaisteBeschriftungen } from '../render/schaltplanSvg'
import { imageSizeFromDataUrl } from '../../../shared/imageSize'
import { beschriftungsAufgaben } from '../generation/schaltplan'

/**
 * Breite des Satzspiegels in Millimetern.
 *
 * A4 abzüglich der Standardränder der mitgelieferten Designvorlagen (25 mm links, 15 mm
 * rechts). Genauer geht es an dieser Stelle nicht: Die Prüfung kennt die Designvorlage nicht,
 * und ein paar Millimeter ändern an der Aussage nichts.
 */
const CONTENT_WIDTH_MM = 170

/**
 * Was ein Bild für das Lernen leistet.
 *
 * Bewusst getrennt von `ImageRole`: Die Rolle sagt, WO das Bild steht und wie groß es ist,
 * die Funktion sagt, WAS es leistet. Nur die Funktion hat gemessene Effektstärken.
 */
export type ImageFunction = 'organisation' | 'repraesentation' | 'schmuck'

export interface ImageFunctionInfo {
  value: ImageFunction
  label: string
  description: string
  /** Kurzbeleg für den Hinweis im Editor */
  evidence: string
}

export const IMAGE_FUNCTIONS: ImageFunctionInfo[] = [
  {
    value: 'organisation',
    label: 'ordnend',
    description: 'Zeigt Struktur, Ablauf oder Zusammenhang: Schema, Diagramm, Zeitleiste, Karte, Versuchsaufbau.',
    evidence: 'Wirkt am stärksten (g = 0,52)'
  },
  {
    value: 'repraesentation',
    label: 'abbildend',
    description: 'Zeigt den Gegenstand selbst: Foto eines Tiers, eines Bauwerks, eines Geräts.',
    evidence: 'Wirkt, aber schwächer (g = 0,24)'
  },
  {
    value: 'schmuck',
    label: 'schmückend',
    description: 'Trägt keine Information, die eine Aufgabe braucht.',
    evidence: 'Ohne Bedingungen eher schädlich (g = −0,16)'
  }
]

export const imageFunctionInfo = (fn: ImageFunction): ImageFunctionInfo => IMAGE_FUNCTIONS.find((f) => f.value === fn) ?? IMAGE_FUNCTIONS[1]

/**
 * Funktion eines Bildes – aus der KI-Angabe, sonst aus der Rolle abgeleitet.
 * Ältere Blätter haben das Feld nicht; sie sollen trotzdem sinnvoll geprüft werden.
 */
export function imageFunction(block: ImageBlock): ImageFunction {
  if (block.fn) return block.fn
  if (block.role === 'motivation') return 'schmuck'
  // Ein Material-Bild ist meistens ein Schema, eine Karte oder ein Diagramm
  if (block.role === 'material') return 'organisation'
  return 'repraesentation'
}

/**
 * Standardbreite eines Bildes in Prozent des Satzspiegels.
 *
 * Bis zum 27.09.2026 bekam jedes Bild 60 %. Auf dem Blatt „Julikrise 1914" stand so eine
 * Zeitleiste mit Ereigniskarten auf rund 100 mm – die Beschriftung war im Druck nicht zu
 * lesen. Ein ORDNENDES Bild (Schema, Zeitleiste, Karte, Diagramm) trägt Text und Struktur und
 * braucht die ganze Breite; ein Foto zum Wiedererkennen kommt mit weniger aus; ein Bild zum
 * Einstieg oder als Schmuck bleibt klein. Seitlich stehende Bilder richtet das Layout selbst
 * aus (render: `.ws-side-image`), die Zahl gilt dort nur als Vorgabe für die Spaltenbreite.
 *
 * FAUSTREGEL aus der Druckpraxis, keine Messung.
 */
export function standardBildbreite(fn: ImageFunction, role: ImageRole, side?: 'left' | 'right' | 'none'): number {
  if (side === 'left' || side === 'right') return 45
  if (role === 'motivation' || fn === 'schmuck') return 35
  if (fn === 'organisation') return 100
  if (role === 'illustration') return 45
  return 80
}

/**
 * Wie viele Bilder ein Blatt trägt.
 *
 * FAUSTREGEL, nicht gemessen: Zu Bildern pro Seite gibt es keine empirischen Normwerte.
 * Belegt ist allein, dass mehrere gleichzeitig sichtbare Bilder ohne eindeutigen Verweis
 * schaden (Flack & Horst 2018) und dass mehrere Bilder an einer Aufgabe aggregiert nichts
 * bringen (Hu et al. 2021). Die Zahlen setzen das um, ohne mehr zu behaupten.
 */
export interface ImageBudget {
  /** Bilder je Seite */
  perPage: number
  /** Bilder je Aufgabenblock */
  perBlock: number
  heuristic: true
}

export function imageBudget(grade: number): ImageBudget {
  if (grade <= 4) return { perPage: 2, perBlock: 1, heuristic: true }
  if (grade <= 10) return { perPage: 3, perBlock: 1, heuristic: true }
  return { perPage: 3, perBlock: 1, heuristic: true }
}

/** Blätter, auf denen der Stoff zum ersten Mal begegnet – dort gilt die Dekorationssperre. */
const INTRODUCTORY: WorksheetMeta['sheetType'][] = ['erarbeitung', 'lesetext']

/**
 * Darf auf dieses Blatt ein Schmuckbild?
 *
 * Setzt die vier belegten Ausnahmen zusammen mit der Sperre aus Lenzner et al. 2013 um:
 * Auf einem Einführungsblatt, das bereits ein erklärendes Bild trägt, würde das Schmuckbild
 * dessen Wirkung schwächen – und zwar bei genau den Lernenden, die sie am nötigsten brauchen.
 */
export function decorGate(meta: WorksheetMeta, blocks: WsBlock[]): { allowed: boolean; reason: string } {
  if (meta.decorImage === false) return { allowed: false, reason: 'In den Blatt-Einstellungen abgeschaltet.' }
  const images = blocks.filter((b): b is ImageBlock => b.type === 'image')
  const explaining = images.filter((b) => imageFunction(b) !== 'schmuck')
  if (INTRODUCTORY.includes(meta.sheetType) && explaining.length > 0) {
    return {
      allowed: false,
      reason:
        'Einführungsblatt mit erklärendem Bild: Ein Schmuckbild würde dessen Wirkung schwächen, besonders bei Lernenden mit wenig Vorwissen (Lenzner u. a. 2013).'
    }
  }
  if (images.some((b) => imageFunction(b) === 'schmuck')) {
    return { allowed: false, reason: 'Es steht bereits ein Schmuckbild auf dem Blatt; die Wirkung ist dosisabhängig (Wesenberg u. a. 2026).' }
  }
  return { allowed: true, reason: 'Ein Schmuckbild ist möglich – thematisch gebunden, freundlich getönt, am Ende eines Abschnitts.' }
}

/**
 * Welcher Realitätsgrad zum Lernziel passt.
 * Richtet sich nach dem, was die Lernenden mit dem Bild TUN sollen, nicht nach dem Alter.
 */
export function realismAdvice(meta: WorksheetMeta): string {
  if (meta.skillFocus === 'vocabulary' || meta.subjectId === 'daz') {
    // Der einzige Bereich, für den Realismus und Farbe metaanalytisch nachweisbar wirken
    return 'Für Begriffs- und Wortschatzarbeit: farbige, realistische Abbildungen (Foto oder detaillierte Zeichnung). Hier – und nur hier – sind Realismus und Farbe belegt wirksam.'
  }
  if (meta.grade <= 4) {
    return 'Grundschule: einfache, aufgeräumte Darstellung mit wenigen Elementen. In Diagrammen einfarbige, ungemusterte Flächen – keine zählbaren Objekte, keine Cliparts als Datenelemente, sonst zählen die Kinder statt zu lesen.'
  }
  if (meta.grade >= 10) {
    return 'Oberstufe: schematische und abstrahierende Darstellungen sind der konkreten Abbildung vorzuziehen, wenn ein Prinzip verstanden oder übertragen werden soll.'
  }
  return 'Realitätsgrad nach Aufgabe: Ein Objekt in der Wirklichkeit wiedererkennen → Foto. Ein Prinzip verstehen, umformen oder übertragen → Schema oder Strichzeichnung.'
}

/** Regeln für den KI-Auftrag. Ersetzt die frühere, gröbere Fassung. */
export function imageDesignRules(meta: WorksheetMeta): string {
  const budget = imageBudget(meta.grade)
  const wunsch = meta.imageAmount ?? 'auto'
  const primary = meta.grade <= 4
  const decor = meta.decorImage !== false
  return [
    'BILDKONZEPT',
    `- Höchstens ${budget.perPage} Bilder je Seite und höchstens ${budget.perBlock} Bild je Aufgabenblock.`,
    /*
     * Der Satz „ein Blatt ohne Bild ist besser als eines mit einem überflüssigen" ist
     * didaktisch richtig – er führte aber dazu, dass oft gar kein Bild vorgeschlagen wurde.
     * Bildersuche und KI-Erzeugung liefen dann ins Leere: Es gab keinen Bedarf zu füllen.
     * Deshalb entscheidet jetzt die Lehrkraft, und nur bei „auto" gilt die Zurückhaltung.
     */
    wunsch === 'keine'
      ? '- Dieses Blatt trägt KEIN Bild. Setze keinen Baustein „image".'
      : wunsch === 'min1'
        ? `- Die Lehrkraft wünscht Bilder: Plane MINDESTENS EIN lernwirksames Bild je Seite ein${seitenVorgabe(meta) ? ` (bei ${seitenText(meta)} also mindestens ${seitenVorgabe(meta)!.min})` : ''}. Wähle dafür die Stelle, an der ein Bild am meisten trägt – ein Schema, eine Karte, ein Versuchsaufbau, ein Foto des Gegenstands. Lass es nie weg, weil dir kein perfektes einfällt.`
        : '- Weniger ist erlaubt: Ein Blatt ohne Bild ist besser als eines mit einem überflüssigen.',
    '',
    'FUNKTION – setze sie in imageFunction:',
    '- "organisation": zeigt Struktur, Ablauf oder Zusammenhang (Schema, Diagramm, Zeitleiste, Karte, Versuchsaufbau, Tabelle als Bild). BEVORZUGE DIESE FORM – sie wirkt mehr als doppelt so stark wie ein bloßes Abbild.',
    '- "repraesentation": bildet den Gegenstand ab (Foto eines Tiers, Bauwerks, Geräts). Richtig, wenn die Lernenden den Gegenstand wiedererkennen oder benennen sollen.',
    decor
      ? '- "schmuck": trägt keine Aufgabeninformation. HÖCHSTENS EINES je Blatt, und nur wenn es (a) thematisch zum Inhalt gehört – gleiches Sachgebiet, benachbarte Begriffe, kein beliebiges nettes Motiv –, (b) freundlich oder neutral wirkt, nie bedrohlich oder traurig, und (c) NICHT am Blattanfang steht, sondern am Ende eines Abschnitts. Steht auf dem Blatt schon ein erklärendes Bild und ist es ein Einführungsblatt: kein Schmuckbild.'
      : '- "schmuck" ist auf diesem Blatt nicht zugelassen: Jedes Bild trägt Aufgabeninformation.',
    '',
    'BEZUG – jedes Bild muss angebunden sein:',
    '- Jedes Bild ist entweder im Bild beschriftet (imageLabels), hat eine Bildunterschrift ODER wird im Aufgabentext ausdrücklich genannt. Ein Bild, auf das nichts verweist, gehört nicht aufs Blatt.',
    '- Das Bild steht im selben Block wie die Aufgabe, zu der es gehört – nicht in einer eigenen Bildspalte und nicht am Seitenrand.',
    '- Stehen mehrere Bilder auf einer Seite, nennt der Aufgabentext eindeutig, welches gemeint ist.',
    '',
    'BESCHRIFTUNG – der stärkste Hebel:',
    '- Sollen Teile eines Bildes benannt werden, liefere imageLabels: je Beschriftung der Text und die Position im Bild in Prozent (x, y von links oben). Die App zeichnet Linie und Schild – schreibe NIE Text in das Bild selbst.',
    '- Setze KEINE Ziffern oder Buchstaben ins Bild, deren Bedeutung darunter in einer Liste steht. Diese Form ist die am schwersten verständliche; die Beschriftung gehört direkt an das gemeinte Element.',
    '- Sollen die Lernenden selbst beschriften, setze blank=true bei den betreffenden Beschriftungen: Auf dem Schülerblatt steht dann eine leere Linie am richtigen Ort, im Lösungsteil der Text.',
    '- EIN Beschriftungsweg: Lässt eine Aufgabe Bildteile benennen, dann ENTWEDER leere Beschriftungen im Bild (blank=true) ODER nummerierte Schreiblinien in der Aufgabe – nie beides.',
    '- Schaltpläne (Stromkreise) zeichnet die App selbst nach DIN: Nenne in der Bildbeschreibung Quelle, Bauteile, Schalterstellung und Anordnung (Reihe/parallel, ggf. zwei Schaltungen nebeneinander). Die Beschriftungen setzt die App an die Bauteile – dafür genügen die Texte.',
    '',
    `REALITÄTSGRAD: ${realismAdvice(meta)}`,
    '',
    primary
      ? [
          'GRUNDSCHULE – gesonderte Regeln:',
          '- Jedes Bild wird im Aufgabentext ausdrücklich genannt („Sieh dir Bild 2 an und …"). Kinder dieses Alters verknüpfen Text und Bild nicht von selbst.',
          '- Nie zwei Bilder nebeneinander, ohne dass der Text sagt, welches gemeint ist.',
          '- Keine dicht beschrifteten Schaubilder: Ein überladenes Diagramm überfordert eher, als dass es hilft.',
          meta.sheetType === 'lesetext' || meta.subjectId === 'deutsch'
            ? '- Geht es um das LESENLERNEN selbst, darf das Bild den Textinhalt NICHT verraten – sonst wird das Entziffern überflüssig und der Leseerwerb leidet.'
            : ''
        ]
          .filter(Boolean)
          .join('\n')
      : '',
    meta.grade >= 5
      ? '- Enthält das Blatt ein Schaubild, Diagramm oder eine Karte, gehört mindestens eine Aufgabe dazu, die die DARSTELLUNG SELBST zum Gegenstand macht (Was zeigt die Achse? Wofür steht die Farbe? Was fehlt?). Das Lesen von Darstellungen ist ein eigenes Lernziel und entsteht nicht nebenbei.'
      : '',
    meta.sheetType === 'wiederholung'
      ? '- Wiederholungsblatt für Fortgeschrittene: Verzichte auf zusätzliche Verknüpfungshilfen (Farbkodierung zwischen Text und Bild, doppelte Erklärungen). Wer den Stoff kennt, wird davon eher gebremst.'
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** Text einer Aufgabe, in dem ein Bildverweis stehen kann. */
const taskText = (b: WsBlock): string =>
  b.type === 'task' ? [b.instruction ?? '', b.brief?.situation ?? '', ...b.parts.map((p) => p.instruction ?? '')].join(' ') : ''

/** Nennt irgendeine Aufgabe dieses Bild – über Materialnummer oder Bildunterschrift? */
function isReferenced(image: ImageBlock, blocks: WsBlock[]): boolean {
  const caption = (image.caption ?? '').trim()
  const label = /\b([MQB]\s?\d+)\b/.exec(caption)?.[1].replace(/\s+/g, '')
  const words = caption
    .replace(/^\s*[MQB]\s?\d+\s*:\s*/, '')
    .split(/\s+/)
    .filter((w) => w.length > 4)
  return blocks.some((b) => {
    const text = taskText(b)
    if (!text) return false
    if (label && text.replace(/\s+/g, '').includes(label)) return true
    // Ein deutlicher Begriff aus der Bildunterschrift zählt auch als Verweis
    return words.some((w) => text.toLowerCase().includes(w.toLowerCase()))
  })
}

/**
 * Prüfungen zu den Bildern eines Blattes.
 * Sie laufen ohne KI, zusammen mit den übrigen Prüfungen beim Erstellen.
 */
export function checkImages(sheet: Sheet, meta: WorksheetMeta): IntegrityFinding[] {
  const out: IntegrityFinding[] = []
  // Verweise, wie sie auf dem Blatt stehen („M3"), nicht wie sie gespeichert sind („M{karte}")
  const blocks = loeseMaterialverweise(sheet.blocks)
  const images = blocks.filter((b): b is ImageBlock => b.type === 'image')
  if (!images.length) return out

  const budget = imageBudget(meta.grade)
  const decorative = images.filter((b) => imageFunction(b) === 'schmuck')

  for (const img of images) {
    const fn = imageFunction(img)
    const hasLabels = Boolean(img.labels?.length)
    const hasCaption = Boolean((img.caption ?? '').trim())

    // Jedes Bild braucht eine Anbindung – sonst steht es unverbunden auf dem Blatt
    if (fn !== 'schmuck' && !hasLabels && !hasCaption && !isReferenced(img, blocks)) {
      out.push({
        blockId: img.id,
        message:
          'Auf dieses Bild verweist nichts: Es hat weder Beschriftung noch Bildunterschrift, und keine Aufgabe nennt es. Besser an eine Aufgabe anbinden oder weglassen.',
        severity: 'mittel'
      })
    }

    /*
     * Eine Bildquelle ohne Herkunft lässt sich nicht quellenkritisch einleiten.
     *
     * Entscheidung der Lehrkraft (25.09.2026): warnen, aber zulassen – das Blatt entsteht,
     * der Hinweis steht im Symbol. Verlangt werden Urheber und Entstehungszeit; ohne sie
     * fehlt der Einleitung ihre Grundlage („Wer? Wann?").
     *
     * Nur dort, wo das Bild wirklich untersucht wird: In der Fremdsprache ist es Sprechanlass,
     * in den Naturwissenschaften meist Schülerprodukt.
     */
    const untersucht = bildzugriff(meta) === 'quelle' || bildzugriff(meta) === 'karikatur'
    if (untersucht && fn !== 'schmuck' && isReferenced(img, blocks)) {
      const c = img.image?.citation
      const fehlt = [!c?.creator?.trim() ? 'Urheber' : '', !c?.date?.trim() ? 'Entstehungszeit' : ''].filter(Boolean)
      if (fehlt.length) {
        out.push({
          blockId: img.id,
          message: `Zu diesem Bild fehlt ${fehlt.join(' und ')}. Für eine quellenkritische Einleitung braucht es beides – die Angaben ergänzen oder ein Bild nehmen, bei dem sie bekannt sind.`,
          severity: 'mittel'
        })
      }
    }

    /*
     * Ist das Bild scharf genug, um daran zu arbeiten?
     *
     * Die KMK-EPA Geschichte (3.3.3) verlangt für bildliche Quellen eine Qualität, „die es den
     * Prüflingen erlaubt, detailgetreu zu analysieren". Nachrechnen lässt sich das über die
     * Breite, die das Bild auf dem Blatt einnimmt – siehe `bildarbeit.ts`.
     *
     * Geprüft wird nur, wo es darauf ankommt: bei Bildern, die untersucht werden sollen.
     */
    if (fn !== 'schmuck' && img.image?.dataUrl && bildzugriff(meta) !== 'keiner' && bildzugriff(meta) !== 'redeanlass') {
      const masse = bildmasse(img.image.dataUrl)
      const noetig = mindestbreite(CONTENT_WIDTH_MM, img.widthPercent)
      if (masse && masse.breite < noetig * 0.75) {
        out.push({
          blockId: img.id,
          message: `Dieses Bild ist mit ${masse.breite} × ${masse.hoehe} Punkten zu grob, um daran zu arbeiten: Für die Breite auf dem Blatt wären etwa ${noetig} Punkte nötig. Einzelheiten im Bild werden im Druck unscharf.`,
          severity: 'mittel'
        })
      }
    }

    // Grundschule: der ausdrückliche Verweis ist Pflicht, nicht Kür
    if (meta.grade <= 4 && fn !== 'schmuck' && !isReferenced(img, blocks)) {
      out.push({
        blockId: img.id,
        message: 'Klasse ' + meta.grade + ': Keine Aufgabe nennt dieses Bild ausdrücklich. Kinder dieses Alters verknüpfen Text und Bild nicht von selbst.',
        severity: 'mittel'
      })
    }
  }

  // Schmuck: Menge, Position und die Sperre auf Einführungsblättern
  if (decorative.length > 1) {
    for (const img of decorative.slice(1)) {
      out.push({
        blockId: img.id,
        message: 'Mehr als ein Schmuckbild auf dem Blatt. Die Wirkung ist dosisabhängig – eines reicht, weitere kosten Aufmerksamkeit.',
        severity: 'mittel'
      })
    }
  }
  const firstDecor = decorative[0]
  if (firstDecor) {
    const index = blocks.indexOf(firstDecor)
    // Am Blattanfang ist der Schaden am größten: Das Bild prägt das falsche Schema vor
    if (index <= 1) {
      out.push({
        blockId: firstDecor.id,
        message: 'Ein Schmuckbild am Blattanfang wirkt am ungünstigsten. Es gehört ans Ende eines Abschnitts.',
        severity: 'mittel'
      })
    }
    if (INTRODUCTORY.includes(meta.sheetType) && images.some((b) => imageFunction(b) !== 'schmuck')) {
      out.push({
        blockId: firstDecor.id,
        message: 'Einführungsblatt mit erklärendem Bild: Ein zusätzliches Schmuckbild schwächt dessen Wirkung, besonders bei Lernenden mit wenig Vorwissen.',
        severity: 'mittel'
      })
    }
  }

  // Mehr Bilder, als das Blatt trägt (Faustregel, an der Anzahl orientiert)
  if (images.length > budget.perPage * seitenBereich(meta).max) {
    out.push({
      blockId: images[images.length - 1].id,
      message: `${images.length} Bilder sind für Klasse ${meta.grade} viel. Vorgesehen sind etwa ${budget.perPage} je Seite; mehrere gleichzeitig sichtbare Bilder ohne eindeutigen Verweis senken die Behaltensleistung.`,
      severity: 'mittel'
    })
  }

  /*
   * Beschriftungspunkte, die ins Leere zeigen (Befund „Wann leuchtet die Lampe?", 30.09.2026):
   * An einem gezeichneten Schaltplan muss jeder Punkt an einem Bauteil sitzen. Und es gibt nur
   * EINEN Beschriftungsweg – leere Linien im Bild UND nummerierte Linien in der Aufgabe
   * verlangen dieselben Namen zweimal und lassen offen, wohin sie gehören.
   */
  for (const img of sheet.blocks.filter((b): b is ImageBlock => b.type === 'image')) {
    if (img.schaltplan && img.labels?.length) {
      const verwaist = verwaisteBeschriftungen(img.schaltplan, img.labels, imageSizeFromDataUrl(img.image?.dataUrl))
      if (verwaist.length) {
        out.push({
          blockId: img.id,
          message: `Im Schaltplan zeigt ${verwaist.length === 1 ? 'ein Beschriftungspunkt' : `${verwaist.length} Beschriftungspunkte`} auf kein Bauteil (${verwaist.map((l) => `„${l.text || 'leere Linie'}"`).join(', ')}). Punkt auf das gemeinte Bauteil ziehen oder die Beschriftung entfernen.`,
          severity: 'mittel'
        })
      }
    }
    /*
     * Zu klein gedruckt (Rückmeldung „kann man nicht erkennen", 30.09.2026): Ein gezeichneter
     * Schaltplan misst 1 Einheit = 1 mm. Wird er verkleinert – schmale Bildbreite oder als Bild
     * neben einer Aufgabe (38 %) –, schrumpfen die Schaltzeichen unter die Lesbarkeit.
     */
    const gezeichnet = img.schaltplan && (img.schaltplan as { version?: number }).version === 2 ? imageSizeFromDataUrl(img.image?.dataUrl) : null
    if (gezeichnet && gezeichnet.width > 0) {
      const neben = img.side === 'left' || img.side === 'right'
      const spalten = img.labels?.some((l) => !l.inline) ? 2 * 26 : 0
      const flaeche = (neben ? CONTENT_WIDTH_MM * 0.38 : (CONTENT_WIDTH_MM * img.widthPercent) / 100) - spalten
      const massstab = flaeche / gezeichnet.width
      if (massstab < 0.85) {
        const noetig = Math.min(100, Math.ceil(((gezeichnet.width * 0.85 + spalten) / CONTENT_WIDTH_MM) * 100))
        out.push({
          blockId: img.id,
          message: `Der Schaltplan wird auf ${Math.round(massstab * 100)} % verkleinert gedruckt – die Schaltzeichen sind dann nur etwa ${Math.max(1, Math.round(massstab * 10))} mm groß und schlecht erkennbar (gut lesbar ab etwa 8 mm). Abhilfe: Bildbreite mindestens ${noetig} %${neben ? ', Bild nicht neben der Aufgabe, sondern darüber' : ''}.`,
          severity: 'mittel'
        })
      }
    }
    if (img.labels?.some((l) => l.blank) && beschriftungsAufgaben([img], sheet.blocks).length) {
      out.push({
        blockId: img.id,
        message:
          'Doppelter Beschriftungsweg: Das Bild hat leere Beschriftungslinien, und die Aufgabe dazu bietet zusätzlich nummerierte Schreiblinien. Besser nur einen Weg – die Linien direkt am Bild.',
        severity: 'mittel'
      })
    }
  }

  // Die nummerierte Beschriftungsliste unter dem Bild ist das schwerste Format
  for (const b of blocks) {
    if (b.type !== 'task') continue
    const usesNumberedLabels = b.parts.some((p) => p.answer?.kind === 'labels' && (p.answer.count ?? 0) >= 3)
    if (!usesNumberedLabels) continue
    const nearby = blocks[blocks.indexOf(b) - 1]
    if (nearby?.type === 'image' && !nearby.labels?.length) {
      out.push({
        blockId: nearby.id,
        message:
          'Beschriftung über eine nummerierte Liste unter dem Bild: Das ist die am schwersten verständliche Form. Besser die Beschriftungen direkt an die Bildelemente setzen (Beschriftungsebene).',
        severity: 'mittel'
      })
    }
  }

  return out
}
