/**
 * Prüfung der Aufgabenstellungen auf Operatorfehler.
 *
 * Die Fälle hier sind nicht ausgedacht – sie stammen aus einer KI-erzeugten
 * Lernzielkontrolle zu den Potenzgesetzen, die die Lehrkraft am 23.09.2026 vorgelegt hat.
 * Jeder Befund hat einen Beleg aus einer amtlichen Operatorenliste.
 *
 * WAS HIER NICHT GEPRÜFT WIRD: ob der Operator zum Anforderungsbereich passt. Das lässt
 * sich nicht prüfen. Die KMK schreibt in den Bildungsstandards Mathematik AHR (18.10.2012):
 * „Die Zuordnung [ist] vom Kontext der Aufgabenstellung und ihrer unterrichtlichen
 * Einordnung abhängig … eine eindeutige Zuordnung zu nur einem Anforderungsbereich [ist]
 * nicht immer möglich." Ob eine Aufgabe AFB I oder III ist, hängt laut LaSuB Sachsen davon
 * ab, ob der Aufgabentyp im Unterricht behandelt wurde – und das weiß nur die Lehrkraft.
 */
import { ALLE_OPERATOREN, istBelegt, konflikteFuer, KERN_OPERATOREN, namenAus, PRAXIS_OPERATOREN, ZU_AUFWENDIG, type Laenderprofil } from './operatoren'

export interface OperatorWarnung {
  blockId: string
  /** 'fehlt' | 'doppelt' | 'kontext' | 'kein-weg' | 'aufwendig' | 'unbekannt' */
  art: string
  message: string
}

/**
 * Findet den Operator am Anfang einer Aufgabenstellung.
 *
 * Deutsche Operatoren stehen in Aufgaben im Imperativ („Berechne"), in den Listen aber
 * meist im Infinitiv („berechnen"). Deshalb wird auf den Stamm zurückgeschnitten. Die
 * bayerische Mittelschulliste steht schon im Imperativ – auch das fällt hier durch.
 */
export function stamm(operator: string): string {
  const w = operator.trim().toLowerCase().split(' ')[0]
  /*
   * Das schließende `n` ist wichtig: Verben auf -ern und -eln bilden den Infinitiv mit
   * bloßem „n", nicht mit „en". „erörtern" endet auf -rn, und ohne diesen Fall blieb der
   * Stamm „erörtern" – „Erörtere" wurde dann nicht als Operator erkannt.
   */
  return w.replace(/(?:en|e|st|t|n)$/, '')
}

/**
 * Nur echte Verbendungen, keine beliebigen Buchstaben.
 *
 * Ein Muster mit „null bis drei beliebigen Buchstaben" sah kürzer aus und war falsch: Es
 * hielt „Entscheidung" für „entscheiden" und „Bedeutung" für „deuten". Beides sind
 * Substantive, die in Aufgabenstellungen ständig vorkommen – „Begründe deine Entscheidung"
 * wäre so als Aufgabe mit zwei Operatoren gemeldet worden.
 */
const ENDUNGEN = '(?:est|et|en|st|e|t)?'

const WORTGRENZE = (s: string): RegExp => new RegExp(`(^|[^a-zäöüß])${s}${ENDUNGEN}(?![a-zäöüß])`, 'i')

/**
 * Imperative, die sich nicht aus dem Infinitiv ableiten lassen.
 *
 * Trennbare Verben stehen in der Aufgabe auseinandergezogen: aus „zuordnen" wird
 * „Ordne … zu", aus „angeben" wird „Gib … an". Der Stamm des Infinitivs steht dann nirgends
 * im Satz.
 */
const IMPERATIVE: Record<string, string[]> = {
  zuordnen: ['ordne zu', 'ordne', 'ordnet'],
  angeben: ['gib an', 'gib', 'gebt an'],
  nachweisen: ['weise nach', 'weis nach'],
  darstellen: ['stelle dar', 'stellt dar'],
  einordnen: ['ordne ein'],
  'grafisch darstellen': ['stelle grafisch dar', 'zeichne']
}

/** Steht dieser Operator in der Aufgabenstellung? */
export function enthaeltOperator(instruction: string, operator: string): boolean {
  const text = instruction.replace(/\*\*/g, '')
  const key = operator.trim().toLowerCase()
  for (const form of IMPERATIVE[key] ?? []) {
    // Getrennte Formen: beide Teile müssen vorkommen, der Imperativ am Wortanfang
    const [kopf, partikel] = form.split(' ')
    if (
      new RegExp(`(^|[^a-zäöüß])${kopf}(?![a-zäöüß])`, 'i').test(text) &&
      (!partikel || new RegExp(`(^|[^a-zäöüß])${partikel}(?![a-zäöüß])`, 'i').test(text))
    ) {
      return true
    }
  }
  const s = stamm(operator)
  if (s.length < 4) return false
  return WORTGRENZE(s).test(text)
}

/** Alle Operatoren, die in der Aufgabenstellung vorkommen – ohne Doppelnennung durch Synonyme. */
export function operatorenIn(instruction: string, bekannt: string[]): string[] {
  const gefunden: string[] = []
  for (const op of bekannt) {
    const s = stamm(op)
    if (s.length < 4 || gefunden.some((g) => stamm(g) === s)) continue
    if (enthaeltOperator(instruction, op)) gefunden.push(op)
  }
  return gefunden
}

/** Antwortformen, bei denen es keinen darzustellenden Lösungsweg gibt. */
const OHNE_LOESUNGSWEG = ['matching', 'multipleChoice', 'trueFalse', 'ordering', 'labels']

/** Operatoren, die einen darzustellenden Lösungsweg verlangen. */
const VERLANGT_WEG = ['bestimmen', 'ermitteln', 'untersuchen', 'berechnen', 'herleiten']

/** Operatoren, die einen vorgegebenen Sachzusammenhang brauchen. */
const BRAUCHT_KONTEXT = ['deuten', 'interpretieren']

/**
 * Vergleicht über den WORTSTAMM, nicht über die Zeichenkette.
 *
 * Nötig, weil die Länderlisten in verschiedenen Formen stehen: Die bayerische
 * Mittelschulliste führt „Bestimme" im Imperativ, alle übrigen „bestimmen" im Infinitiv.
 * Ein Vergleich über `includes` fand den bayerischen Operator deshalb nie – und die Prüfung
 * „Bestimme bei einer Zuordnungsaufgabe" blieb in Bayern stumm, also ausgerechnet dort, wo
 * die Vorlage herkam.
 */
const gleicherOperator = (liste: string[], op: string): boolean => liste.some((x) => stamm(x) === stamm(op))

export interface AufgabeZurPruefung {
  id: string
  instruction: string
  /** Antwortform, um zu erkennen, ob es einen Lösungsweg gibt */
  answerKind: string
  /** Bezieht sich die Aufgabe auf ein Material? */
  hatMaterial: boolean
}

export function pruefeOperatoren(aufgaben: AufgabeZurPruefung[], profil: Laenderprofil | undefined): OperatorWarnung[] {
  const out: OperatorWarnung[] = []
  // Die praxisüblichen gelten überall mit – sie sind durch die Öffnungsklauseln gedeckt
  const bekannt = [...(profil ? namenAus(profil) : KERN_OPERATOREN), ...PRAXIS_OPERATOREN]
  /** Der Anfang der Aufgabenstellung fürs Zitat – abgeschnitten an einer Wortgrenze. */
  const kurz = (t: string): string => {
    const rein = t.replace(/\*\*/g, '').trim()
    if (rein.length <= 52) return rein
    const teil = rein.slice(0, 52)
    return `${teil.slice(0, teil.lastIndexOf(' ')) || teil}…`
  }

  for (const a of aufgaben) {
    const gefunden = operatorenIn(a.instruction, [...bekannt, ...ZU_AUFWENDIG])

    if (!gefunden.length) {
      /*
       * Zwei sehr verschiedene Fälle, die man auseinanderhalten muss:
       * Steht überhaupt kein Operator da („Aufgabe 3: 2³ · 2⁴"), ist das ein Fehler.
       * Steht einer da, den nur DIESES Land nicht führt, ist es meist in Ordnung – sieben
       * der acht gelesenen Listen erlauben ungelistete Operatoren ausdrücklich.
       */
      const anderswo = operatorenIn(a.instruction, ALLE_OPERATOREN)
      if (anderswo.length) {
        /*
         * Gemeldet wird nur, wo das Land KEINE Öffnungsklausel hat – das ist unter den acht
         * gelesenen Listen allein Hessen. Überall sonst ist ein ungelisteter Operator
         * ausdrücklich erlaubt, und eine Meldung dazu wäre Nörgelei.
         */
        if (profil && !profil.oeffnungsklausel) {
          out.push({
            blockId: a.id,
            art: 'unbekannt',
            message: `„${anderswo[0]}" steht nicht in der Operatorenliste (${profil.quelle}). Diese Liste enthält keine Öffnungsklausel für weitere Operatoren.`
          })
        }
        // Die inhaltlichen Prüfungen gelten in jedem Fall – der Operator ist ja erkannt
        gefunden.push(...anderswo)
      } else {
        out.push({
          blockId: a.id,
          art: 'fehlt',
          message: `„${kurz(a.instruction)}" beginnt mit keinem erkennbaren Operator. Ohne Operator sagt die Aufgabe nicht, was verlangt wird – ob ein Ergebnis, ein Weg oder eine Begründung.`
        })
        continue
      }
    }

    // 2. Zwei Operatoren in einer Aufgabenstellung
    if (gefunden.length > 1) {
      out.push({
        blockId: a.id,
        art: 'doppelt',
        message: `„${kurz(a.instruction)}" verlangt zwei Dinge auf einmal (${gefunden.join(', ')}). Als zwei Teilaufgaben a) und b) ist klar, was wofür zählt – so ist es weder eindeutig zu bearbeiten noch eindeutig zu bepunkten.`
      })
    }

    for (const op of gefunden) {
      // 3. „Deute" ohne Sachzusammenhang
      if (gleicherOperator(BRAUCHT_KONTEXT, op) && !a.hatMaterial) {
        out.push({
          blockId: a.id,
          art: 'kontext',
          message: `„${op}" braucht einen vorgegebenen Sachzusammenhang. Die Deutung „stellt einen Zusammenhang her z. B. zwischen einer grafischen Darstellung, einem Term oder dem Ergebnis einer Rechnung und einem vorgegebenen Sachzusammenhang" (abitur.nrw, Mathematik). Ohne Material oder Sachkontext ist der Operator nicht erfüllbar.`
        })
      }

      // 4. Operator verlangt einen Weg, die Antwortform hat keinen
      if (gleicherOperator(VERLANGT_WEG, op) && OHNE_LOESUNGSWEG.includes(a.answerKind)) {
        out.push({
          blockId: a.id,
          art: 'kein-weg',
          message: `„${op}" verlangt, dass das Vorgehen dargestellt wird – in dieser Antwortform gibt es aber keinen Weg zum Darstellen. Passend wäre „Gib an" oder „Nenne": „Für die Angabe bzw. Nennung ist keine Begründung notwendig" (abitur.nrw).`
        })
      }

      // 5. Für einen Kurztest zu aufwendig
      if (gleicherOperator(ZU_AUFWENDIG, op)) {
        out.push({
          blockId: a.id,
          art: 'aufwendig',
          message: `„${op}" ist für eine Lernzielkontrolle sehr aufwendig. Der Stoff reicht nur über die unmittelbar vorangegangenen Stunden (in Bayern höchstens zwei, GSO § 23), und die Bearbeitungszeit liegt bei 20 bis 30 Minuten.`
        })
      }

      // 6. Operator nicht in der Landesliste, und das Land lässt keine anderen zu
      if (profil && !profil.oeffnungsklausel && !gleicherOperator(namenAus(profil), op) && !out.some((w) => w.blockId === a.id && w.art === 'unbekannt')) {
        out.push({
          blockId: a.id,
          art: 'unbekannt',
          message: `„${op}" steht nicht in der Operatorenliste (${profil.quelle}). Diese Liste enthält keine Öffnungsklausel für weitere Operatoren.`
        })
      }
    }
  }
  return out
}

/**
 * Hinweise zu Operatoren, deren Bedeutung sich zwischen Ländern unterscheidet.
 *
 * Nicht als Fehler, sondern als Warnung an die Lehrkraft: Wer das Blatt in einem anderen
 * Land verwendet, bekommt eine andere Aufgabe.
 */
export function bedeutungsHinweise(aufgaben: AufgabeZurPruefung[], profil: Laenderprofil | undefined, fach: string): string[] {
  if (!profil) return []
  const out: string[] = []
  const gesehen = new Set<string>()
  for (const a of aufgaben) {
    for (const op of operatorenIn(a.instruction, namenAus(profil))) {
      for (const k of konflikteFuer(op, fach)) {
        if (!k.laender.includes(profil.stateId) || gesehen.has(k.operator + k.laender.join())) continue
        gesehen.add(k.operator + k.laender.join())
        out.push(`„${k.operator}" bedeutet nicht überall dasselbe. ${k.unterschied}`)
      }
    }
  }
  return out
}

/**
 * Der Regelteil für den KI-Auftrag.
 *
 * Gibt Definitionen NUR aus, wenn sie für dieses Land, dieses Fach und diese Stufe belegt
 * sind. Ohne Profil bleiben nur die Namen – eine fremde Definition würde unbemerkt einen
 * anderen Erwartungshorizont erzeugen, und der Fehler sähe für die Lehrkraft wie ein
 * KI-Problem aus.
 */
export function operatorRegeln(profil: Laenderprofil | undefined): string {
  const zeilen = [
    'OPERATOREN:',
    '- Jede Aufgabenstellung beginnt mit GENAU EINEM Operator im Imperativ. Kein nackter Term, keine Frage ohne Arbeitsauftrag.',
    '- Nie zwei Operatoren in einer Aufgabenstellung („Entscheide … und widerlege"). Wenn zwei Leistungen verlangt sind, werden es zwei Teilaufgaben a) und b).',
    '- Der Operator muss zur Antwortform passen: Wo kein Lösungsweg aufgeschrieben wird (Zuordnung, Ankreuzen, Wahr/Falsch), steht „Gib an" oder „Nenne", nicht „Bestimme" oder „Ermittle".',
    `- Für eine Lernzielkontrolle NICHT verwenden: ${ZU_AUFWENDIG.join(', ')}. Die Bearbeitungszeit reicht dafür nicht.`
  ]
  // Ein abgeleitetes Profil ist keine Landesvorgabe – es zaehlt hier wie „kein Profil"
  if (!profil || !istBelegt(profil)) {
    return [
      ...zeilen,
      `- Verwende Operatoren aus diesem Bestand: ${(profil ? namenAus(profil) : KERN_OPERATOREN).join(', ')}.`,
      profil?.herkunft === 'kmk' || profil?.herkunft === 'oberstufe'
        ? `- Für dieses Bundesland, dieses Fach und diese Stufe liegt keine Landesliste vor; der Bestand stammt aus ${profil.quelle}. Verwende die Operatoren in ihrer üblichen fachlichen Bedeutung und erfinde keine Definition.`
        : '- Für dieses Bundesland und diese Stufe liegt keine amtliche Operatorenliste vor. Verwende die Operatoren in ihrer üblichen fachlichen Bedeutung und erfinde keine Definition.'
    ].join('\n')
  }
  const mitDefinition = profil.operatoren.filter((o) => o.definition)
  return [
    ...zeilen,
    `- Maßgeblich ist: ${profil.quelle} (Stand ${profil.stand}).`,
    /*
     * Die Anrede steht NICHT mehr hier, sondern als eigene Regel im Auftrag (kurztestPrompt,
     * Paket 8b). Die Listen reden ihre Leser verschieden an – mehrere Sek-I-Listen siezen –,
     * die Lehrkraft hat aber entschieden: Sek I du, Sek II Sie. Die Definitionen unten sind
     * wörtliche Zitate und behalten die Form ihrer Quelle.
     */
    '- Die Definitionen unten sind wörtlich aus der Landesliste zitiert. Ihre Anrede ist die der Quelle; für die Aufgabenstellungen gilt die Regel unter ANREDE.',
    ...(mitDefinition.length
      ? [
          '',
          'Die Operatoren bedeuten in diesem Land genau Folgendes:',
          // Die Teilkompetenz steht dabei: „cocher" gehoert zum Hoerverstehen und hat in
          // einer Schreibaufgabe nichts zu suchen.
          ...mitDefinition.map((o) => `- ${[o.name, ...(o.synonyme ?? [])].join(', ')}: ${o.definition}${o.teilkompetenz ? ` [${o.teilkompetenz}]` : ''}`)
        ]
      : []),
    ...(profil.operatoren.some((o) => o.teilkompetenz)
      ? [
          '',
          'Die Angabe in eckigen Klammern nennt die kommunikative Teilkompetenz. Verwende einen Operator NUR in einer Aufgabe, die zu seiner Teilkompetenz passt.'
        ]
      : []),
    ...(profil.oeffnungsklausel
      ? [
          '',
          'Ein Operator, der hier nicht steht, ist zulässig, wenn sich seine Bedeutung aus der standardsprachlichen Verwendung ergibt (so die Quelle selbst).'
        ]
      : ['', 'Diese Liste hat KEINE Öffnungsklausel. Verwende ausschließlich die genannten Operatoren.'])
  ].join('\n')
}
