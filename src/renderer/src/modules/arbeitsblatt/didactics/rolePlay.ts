/**
 * Rollenspiel als Unterrichtsmethode.
 *
 * Grundlage der Recherche:
 * - ISB Bayern: „Das pädagogische Rollenspiel" (2006) – Rollenkarten-Vorlage, Spielregeln,
 *   Entrollung, Auswertung, Bewertung, große Gruppen.
 * - Reich, K.: Methodenpool „Rollenspiele" (Universität zu Köln) – Phasenmodell,
 *   Bühnenformen, Beobachtungsbogen.
 * - Bundeszentrale für politische Bildung: Methode „Rollenspiel", Methoden-Kiste,
 *   Rollenprofile für Planspiele.
 * - sowi-online: rollengebundene Podiumsdiskussion, Abgrenzung Rollen-/Planspiel.
 * - Bernhardt, M.: „Geschichte inszenieren", GWU 55 (2004) – die drei für Geschichte
 *   zulässigen Spieltypen und der Einwand gegen das gewöhnliche Rollenspiel.
 * - Reckeweg, T.: „Szenisches Rollenspiel im Geschichtsunterricht" (2010) – Anachronismen.
 * - USHMM: „Guidelines for Teaching about the Holocaust" – kein Nachspielen.
 * - Wehling: Beutelsbacher Konsens (Überwältigungsverbot, Kontroversitätsgebot).
 * - KMK-Bildungsstandards Deutsch und erste Fremdsprache – Rollenspiel als Prüfungsformat
 *   und die Bewertungsdimensionen dialogischen Sprechens.
 *
 * Zwei Abgrenzungen sind wichtig und stehen deshalb hier:
 * - Ein **Planspiel** ist kein Rollenspiel: Es hat mehrere Spielperioden und eine
 *   Modellkomponente, deren Rückkopplung neue Situationen erzeugt.
 * - In **Geschichte** ist das gewöhnliche Rollenspiel umstritten. Bernhardt hält es für
 *   „wenig Ungeeigneteres", weil es der Selbst- und nicht der Fremderkenntnis dient. Zulässig
 *   sind seine drei Formen, bei denen Spielhandlung und historische Handlung getrennt
 *   bleiben, aber aufeinander bezogen werden.
 */

export interface RolePlayType {
  id: string
  label: string
  /** Fächer, für die die Form belegt ist; leer = alle */
  subjects: string[]
  /** Zahl der Rollen (von, bis) */
  roles: [number, number]
  /** Minuten für Vorbereitung, Spiel und Auswertung */
  minutes: { prep: number; play: number; review: number }
  /** Wofür die Form didaktisch taugt */
  purpose: string
  /** Was schiefgeht, wenn man nicht aufpasst */
  pitfall: string
  /** Bauanleitung für die KI */
  construction: string
}

export const ROLE_PLAY_TYPES: RolePlayType[] = [
  {
    id: 'podiumsdiskussion',
    label: 'Rollengebundene Podiumsdiskussion',
    subjects: ['politik', 'geschichte', 'biologie', 'erdkunde', 'ethik', 'religion', 'werte-und-normen', 'chemie', 'physik', 'deutsch'],
    roles: [5, 5],
    minutes: { prep: 45, play: 25, review: 25 },
    purpose: 'Kontroversität, Urteilsbildung, Argumentieren',
    pitfall: 'Die Moderation ist ohne Satzbausteine überfordert, und das Publikum langweilt sich ohne Beobachtungsauftrag.',
    construction:
      'Zwei Rollen vertreten die eine, zwei die andere Seite, dazu eine Moderation mit Ablaufplan, Zeittakten und Satzbausteinen. Alle übrigen Lernenden bekommen einen Beobachtungsbogen. Eröffnungs- und Schlussstatement sind vorgesehen; am Ende steht eine Abstimmung oder Entscheidungslinie.'
  },
  {
    id: 'konferenz',
    label: 'Konferenz oder Verhandlung',
    subjects: ['politik', 'geschichte', 'wirtschaft', 'erdkunde', 'ethik', 'werte-und-normen'],
    roles: [4, 8],
    minutes: { prep: 50, play: 25, review: 35 },
    purpose: 'Interessenkonflikte, Kompromissbildung, Machtunterschiede, Logik von Institutionen',
    pitfall: 'Ohne „Grenzen des Verhandelbaren" einigen sich alle sofort – der Konflikt verschwindet.',
    construction:
      'Jede Rolle vertritt eine Partei mit eigenen Interessen, Machtmitteln und Bedingungen für eine Zustimmung. Es gibt ein Verhandlungsergebnis, das festgehalten wird, und mindestens eine Rolle, die nicht nachgeben darf.'
  },
  {
    id: 'talkshow',
    label: 'Talkshow oder Fernsehrunde',
    subjects: ['geschichte', 'politik', 'deutsch', 'englisch', 'franzoesisch', 'spanisch'],
    roles: [5, 8],
    minutes: { prep: 45, play: 25, review: 45 },
    purpose: 'Mehrere Sichtweisen sichern, nachdem die Quellen ausgewertet sind; Sprechanlass',
    pitfall: 'Die Unterhaltung gewinnt gegen die Sache; die Zeit läuft davon.',
    construction:
      'Eine Moderation führt durch die Sendung und achtet auf die Zeit; jede eingeladene Person vertritt eine Position mit Belegen. Die Spielzeit ist auf höchstens 30 Minuten begrenzt.'
  },
  {
    id: 'gericht',
    label: 'Gerichtsverhandlung oder Tribunal',
    subjects: ['geschichte', 'politik', 'ethik', 'werte-und-normen', 'deutsch', 'wirtschaft'],
    roles: [6, 10],
    minutes: { prep: 75, play: 40, review: 45 },
    purpose: 'Beweisführung, Quellenkritik, Normen gegen Fakten abwägen',
    pitfall: 'Ein Schuldspruch ist kein Lernziel – und für NS-Verbrechen ist diese Form nicht zulässig.',
    construction:
      'Anklage, Verteidigung, Gericht, Zeugen und Beobachter. Jede Seite stützt sich auf Belege aus dem Material. Das Ergebnis ist eine begründete Abwägung, kein Urteil über Menschen.'
  },
  {
    id: 'dilemma',
    label: 'Entscheidungsspiel (Dilemma)',
    subjects: ['ethik', 'religion', 'werte-und-normen', 'philosophie', 'biologie', 'deutsch', 'politik'],
    roles: [3, 6],
    minutes: { prep: 25, play: 15, review: 30 },
    purpose: 'Güter abwägen, moralisch urteilen, Perspektive wechseln',
    pitfall: 'Die Nähe zur eigenen Lebenslage: Keine Frage stellen, die etwas über die Lernenden selbst aufdeckt.',
    construction:
      'Eine Figur muss zwischen zwei Gütern wählen, die beide gute Gründe haben. Die übrigen Rollen vertreten je einen dieser Gründe. Die Entscheidung wird begründet, nicht abgestimmt.'
  },
  {
    id: 'debatte',
    label: 'Streitgespräch (Pro und Contra)',
    subjects: [],
    roles: [4, 8],
    minutes: { prep: 35, play: 25, review: 15 },
    purpose: 'Argumentieren, Kontroversität, eigene Meinung bilden',
    pitfall: 'Die Gewinner-Logik: Es geht nicht darum, wer lauter ist.',
    construction:
      'Die Seiten werden ausgelost, und das wird ausdrücklich gesagt: Die vertretene Position ist nicht die eigene Meinung. Eröffnungsstatements von je drei Minuten, dann Rede und Gegenrede, am Ende eine Abstimmung vor und nach der Debatte.'
  },
  {
    id: 'interview',
    label: 'Fiktives Interview',
    subjects: ['geschichte', 'politik', 'deutsch', 'biologie', 'englisch', 'franzoesisch', 'spanisch'],
    roles: [2, 3],
    minutes: { prep: 20, play: 10, review: 15 },
    purpose: 'Einen Text erschließen und eine Position aus ihrer Sicht darstellen',
    pitfall: 'Es darf nicht als echtes Zeitzeugengespräch erscheinen – das ist eine andere Methode.',
    construction: 'Eine Person fragt, eine antwortet aus der Rolle. Die Fragen entstehen aus dem Material; jede Antwort stützt sich auf eine Stelle darin.'
  },
  {
    id: 'stadtrat',
    label: 'Stadtrats- oder Gemeinderatssitzung',
    subjects: ['erdkunde', 'politik', 'wirtschaft', 'chemie'],
    roles: [6, 10],
    minutes: { prep: 45, play: 25, review: 30 },
    purpose: 'Streit um die Nutzung eines Raumes, kommunale Entscheidungswege',
    pitfall: 'Bevölkerungsgruppen als Klischee zu zeichnen.',
    construction: 'Ein konkreter Vorschlag steht zur Abstimmung. Jede Rolle ist von ihm anders betroffen und hat eine eigene Begründung.'
  },
  {
    id: 'alltag',
    label: 'Alltagsgespräch (Einkauf, Amt, Restaurant)',
    subjects: ['englisch', 'franzoesisch', 'spanisch', 'latein', 'daz', 'deutsch', 'wirtschaft'],
    roles: [2, 4],
    minutes: { prep: 12, play: 5, review: 10 },
    purpose: 'An Gesprächen teilnehmen, Höflichkeitsformeln, Routinen',
    pitfall: 'Eine zu vage Situation ergibt kein Gespräch; ohne Redemittel bricht es ab.',
    construction: 'Ort, Anliegen und eine kleine Schwierigkeit sind vorgegeben. Jede Rolle bekommt vier bis sechs Redemittel.'
  },
  {
    id: 'bewerbung',
    label: 'Bewerbungsgespräch',
    subjects: ['wirtschaft', 'deutsch', 'englisch', 'politik'],
    roles: [2, 3],
    minutes: { prep: 20, play: 10, review: 15 },
    purpose: 'Register, sich vorstellen, Gesprächsstrategien',
    pitfall: 'Es kippt leicht in eine Bewertung der Person – die Rückmeldung gilt der Rolle.',
    construction: 'Stellenanzeige und Lebenslauf sind gegeben. Die fragende Rolle hat einen Fragenkatalog, die sich bewerbende drei Stärken und eine Schwäche.'
  },
  {
    id: 'erklaeren',
    label: 'Erklär-Rollenspiel',
    subjects: ['physik', 'chemie', 'biologie', 'mathematik', 'informatik'],
    roles: [2, 2],
    minutes: { prep: 10, play: 10, review: 15 },
    purpose: 'Einem Gegenüber angemessen erklären; dabei zeigt sich, was wirklich verstanden ist',
    pitfall: 'Fehlendes Fachwissen blockiert – die erklärende Rolle braucht eine Informationskarte.',
    construction:
      'Eine Rolle erklärt, die andere fragt nach und versteht bewusst zunächst nicht. Die erklärende Rolle bekommt die Sache auf drei Abstraktionsebenen, die fragende eine Liste mit Nachfragen.'
  },
  {
    id: 'historiografisch',
    label: 'Historiografisches Spiel (nach der Quellenarbeit)',
    subjects: ['geschichte'],
    roles: [4, 8],
    minutes: { prep: 45, play: 25, review: 45 },
    purpose: 'Ergebnisse der Quellenarbeit sichern und vertiefen – die für Geschichte empfohlene Form',
    pitfall: 'Spielhandlung und historische Handlung müssen getrennt bleiben; sonst entsteht die Illusion, „so war es".',
    construction:
      'Gespielt wird nicht die historische Szene selbst, sondern ein heutiges oder späteres Format darüber: eine Redaktionssitzung, eine Radiosendung, eine Debatte über das Gedenken. Die Ergebnisse der Quellenarbeit werden dort vorgetragen und geprüft.'
  },
  {
    id: 'typisiert',
    label: 'Typisiertes Spiel (verfremdete Struktur)',
    subjects: ['geschichte', 'politik'],
    roles: [4, 8],
    minutes: { prep: 30, play: 20, review: 40 },
    purpose: 'Interessenkonstellationen und Handlungszwänge modellhaft erfahrbar machen',
    pitfall: 'Die Verfremdung muss danach ausdrücklich zurück auf die historische Lage bezogen werden.',
    construction:
      'Die historische Lage wird in eine heutige oder erfundene Situation übersetzt, die dieselbe Interessenstruktur hat. Nach dem Spiel folgt der Abgleich mit dem historischen Fall.'
  }
]

export const rolePlayTypeById = (id: string): RolePlayType | undefined => ROLE_PLAY_TYPES.find((t) => t.id === id)

/** Formen, die für dieses Fach belegt sind. */
export function rolePlayTypesFor(subjectId: string): RolePlayType[] {
  return ROLE_PLAY_TYPES.filter((t) => !t.subjects.length || t.subjects.includes(subjectId))
}

/**
 * Fächer, für die es keine belegte Rollenspiel-Didaktik gibt.
 * Die Form wird trotzdem angeboten, aber mit sichtbarem Hinweis.
 */
export const WITHOUT_ESTABLISHED_PRACTICE = ['mathematik', 'kunst', 'musik', 'sport']

/**
 * Themen, bei denen ein Rollenspiel aus der Perspektive von Opfern oder Tätern nicht
 * zulässig ist. Das US Holocaust Memorial Museum hält das Nachspielen für „pedagogically
 * unsound": Die Lernenden behielten den Eindruck, nun zu wissen, wie es war.
 */
const SENSITIVE = [
  'holocaust',
  'shoah',
  'auschwitz',
  'konzentrationslager',
  'vernichtungslager',
  'judenverfolgung',
  'nationalsozialismus',
  'ns-zeit',
  'drittes reich',
  'völkermord',
  'genozid',
  'sklaverei',
  'sklavenhandel',
  'vergewaltigung',
  'missbrauch',
  'folter',
  'deportation',
  'vertreibung',
  'flucht'
]

/** Berührt das Thema einen Gegenstand, der nicht nachgespielt werden darf? */
export function isSensitiveForRolePlay(topic: string): boolean {
  const t = topic.toLowerCase()
  return SENSITIVE.some((s) => t.includes(s))
}

/** Regeln für den KI-Auftrag, wenn das Blatt ein Rollenspiel enthalten soll. */
export function rolePlayRules(meta: {
  subjectId: string
  subjectLabel: string
  topic: string
  socialForms: string[]
  rolePlayType?: string
  grade: number
}): string {
  if (!meta.socialForms.includes('Rollenspiel')) return ''
  const type = meta.rolePlayType ? rolePlayTypeById(meta.rolePlayType) : undefined
  const possible = rolePlayTypesFor(meta.subjectId)
  const sensitive = isSensitiveForRolePlay(meta.topic)
  const history = meta.subjectId === 'geschichte'

  return [
    'ROLLENSPIEL: Das Blatt bereitet ein Rollenspiel vor und wertet es aus.',
    type
      ? `- FORM: ${type.label}. ${type.construction} Zahl der Rollen: ${type.roles[0]}${type.roles[1] !== type.roles[0] ? ` bis ${type.roles[1]}` : ''}.`
      : `- FORM: Wähle eine passende und nenne sie. Möglich sind: ${possible.map((t) => t.label).join(', ')}.`,
    '',
    'DAS BLATT ENTHÄLT IN DIESER REIHENFOLGE:',
    '1. Die SPIELSITUATION für alle gleich: Ort, Zeit, beteiligte Personen, Umstände – und in einem Satz die Streit- oder Entscheidungsfrage.',
    '2. Für JEDE Rolle eine eigene ROLLENKARTE (je ein Baustein "text" mit dem Namen der Rolle als Titel) mit: Name und Funktion · Ausgangslage in zwei bis drei Sätzen · zwei bis drei Interessen · das Ziel in dieser Situation in einem überprüfbaren Satz · drei Argumente, davon eines mit einem Beleg oder einer Zahl · Machtmittel (was die Rolle wirklich tun kann: zustimmen, blockieren, Öffentlichkeit herstellen) · GRENZEN DES VERHANDELBAREN („Zustimmung nur, wenn …", „Darauf darfst du dich nicht einlassen: …") · vier bis sechs Redemittel · den Vorbereitungsauftrag, Argumente zu notieren UND die Gegenargumente vorwegzunehmen.',
    '3. Falls die Form eine Moderation vorsieht: eine MODERATIONSKARTE mit Ablauf, Zeittakten und Satzbausteinen.',
    '4. Einen BEOBACHTUNGSBOGEN für alle, die nicht spielen, mit vier bis sechs konkreten Fragen zum Ankreuzen oder Notieren.',
    '5. Einen Baustein ENTROLLUNG: eine ausdrückliche Anweisung, die Rolle abzulegen („Rollenkarte umdrehen. Sagt euch gegenseitig: Du bist jetzt wieder …"). Dieser Schritt ist Pflicht – die Kritik gilt dem Rollenverhalten, nie der Person.',
    '6. REFLEXIONSFRAGEN in drei Gruppen: aus der Rolle heraus („Wie ist es dir als X ergangen?"), zur Sache („Welches Argument war das stärkste – und warum?") und ein Urteil OHNE Rolle („Was meinst du selbst?") samt Gegenwartsbezug.',
    type
      ? `7. Eine Zeitangabe: etwa ${type.minutes.prep} Minuten Vorbereitung, ${type.minutes.play} Minuten Spiel, ${type.minutes.review} Minuten Auswertung.`
      : '',
    '',
    'VERBINDLICHE REGELN:',
    '- Die Rollen sind argumentativ GLEICH STARK ausgestattet. Keine Rolle ist nur dazu da, widerlegt zu werden (Kontroversitätsgebot des Beutelsbacher Konsenses).',
    '- Auf dem Blatt steht, dass die zugewiesene Position NICHT die eigene Meinung ist.',
    '- Keine Rolle wird so geschrieben, dass sie einem Kind der Klasse zu genau entspricht; keine Frage deckt Persönliches auf.',
    '- Bewertet werden Sachrichtigkeit, Argumentation, Rollentreue und die Reflexion – nicht Schauspieltalent, Lautstärke oder wer „gewonnen" hat.',
    history
      ? '- GESCHICHTE: Spielhandlung und historische Handlung bleiben getrennt, werden aber aufeinander bezogen. Auf dem Blatt steht ausdrücklich: „Es könnte ungefähr so gewesen sein" – nicht „So war es". Ergänze für die Lehrkraft einen kurzen Kasten mit den Punkten, an denen Anachronismen drohen (Anreden, Währung, Technik, Rechtsverhältnisse, heutige Begriffe).'
      : '',
    sensitive
      ? '- ACHTUNG, EMPFINDLICHES THEMA: Zu diesem Gegenstand darf NIEMAND die Rolle von Opfern oder Tätern übernehmen. Das Nachspielen ist fachlich unzulässig (US Holocaust Memorial Museum). Wähle stattdessen ein Format ÜBER das Thema: eine Redaktionssitzung, eine Debatte über das Gedenken, die Konzeption einer Ausstellung, eine Berichterstattung über einen Prozess. Begründe das im Hinweis für die Lehrkraft.'
      : '',
    WITHOUT_ESTABLISHED_PRACTICE.includes(meta.subjectId)
      ? `- Für ${meta.subjectLabel} gibt es keine etablierte Rollenspiel-Didaktik. Vermerke das im Hinweis für die Lehrkraft und begründe, warum die Form hier trotzdem trägt.`
      : '',
    '- Ein Planspiel ist KEIN Rollenspiel: Erzeuge keine mehreren Spielrunden mit Rückkopplung.'
  ]
    .filter(Boolean)
    .join('\n')
}
