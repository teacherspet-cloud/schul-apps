/**
 * Vorgaben für abiturbezogene Übungsaufgaben und Übungsklausuren.
 *
 * Wunsch der Lehrkraft (24.09.2026): „dass man Vorgaben für an Abituraufgaben angelehnte
 * Übungsaufgaben und Übungsklausuren entwerfen lassen kann."
 *
 * Die Zahlen und Regeln stammen aus `didactics/abitur.ts`; hier werden sie in Sätze
 * übersetzt, die eine KI befolgen kann. Zwei Dinge stehen bewusst darin:
 *
 * - Was NICHT belegt ist, wird als Richtwert ausgewiesen. Eine erfundene Prozentangabe, die
 *   wie eine amtliche Vorgabe klingt, wäre schlimmer als gar keine: Die Lehrkraft würde sich
 *   darauf berufen.
 * - Die Aufgabe bleibt eine ÜBUNG. Sie ist an das Abitur angelehnt, sie ist keines – und der
 *   Hinweis darauf gehört auf das Blatt, nicht nur in den Kopf der Lehrkraft.
 */
import { abiturProfil, NIVEAU_LABEL, teilVorgaben, type AbiturProfil, type Anforderungsniveau } from '../didactics/abitur'
import type { WorksheetMeta } from '../model/types'

/** Ist für dieses Blatt der Abitur-Modus eingeschaltet? */
export function abiturAktiv(meta: Pick<WorksheetMeta, 'abitur' | 'grade' | 'subjectId'>): boolean {
  return Boolean(meta.abitur?.an) && meta.grade >= 12 && abiturProfil(meta.subjectId) !== null
}

/**
 * Ist das eine ÜBUNGSKLAUSUR – die vollständige Prüfungssituation statt einer Einzelaufgabe?
 *
 * Daran hängen mehrere Entscheidungen: die Reihenfolge von Aufgabe und Material, das
 * Hilfsblatt auf eigener Seite, die Auswahlmöglichkeit zwischen Vorschlägen. Sie steht
 * deshalb an EINER Stelle. Vorher prüfte jede Stelle für sich `meta.abitur?.an &&
 * meta.abitur.klausur` – bis eine es vergaß.
 */
export function istUebungsklausur(meta: Pick<WorksheetMeta, 'abitur'>): boolean {
  return Boolean(meta.abitur?.an && meta.abitur.klausur)
}

/**
 * In den Fremdsprachen bestimmt der KOMPETENZSCHWERPUNKT die Aufgabenart.
 *
 * Gemeldet von der Lehrkraft (24.09.2026): „doppelt sich mit kompetenzschwerpunkt bei
 * anlehnung an abituraufgaben. entferne diese doppelte abfrage."
 *
 * Sie hat recht: Die drei Pruefungsteile des Fremdsprachen-Abiturs – Hoerverstehen,
 * Sprachmittlung, Schreiben – sind genau die Kompetenzschwerpunkte, die weiter oben schon
 * eingestellt werden. Zweimal dasselbe zu fragen, laedt nur dazu ein, sich zu widersprechen.
 *
 * Die uebrigen Faecher kennen keinen Kompetenzschwerpunkt; dort bleibt die eigene Auswahl.
 */
export function aufgabenartFuer(meta: Pick<WorksheetMeta, 'abitur' | 'skillFocus'>, profil: AbiturProfil): string {
  if (!profil.pruefungsteile) return meta.abitur?.aufgabenart ?? profil.aufgabenarten[0].id
  const ausSchwerpunkt: Record<string, string> = {
    writing: 'schreiben',
    mediation: 'sprachmittlung',
    listening: 'hoerverstehen'
  }
  // Ohne passenden Schwerpunkt das Schreiben: Es traegt im Abitur 55 % und ist der Kern
  return ausSchwerpunkt[meta.skillFocus ?? ''] ?? 'schreiben'
}

function aufgabenartText(profil: AbiturProfil, id: string): string {
  const art = profil.aufgabenarten.find((a) => a.id === id) ?? profil.aufgabenarten[0]
  return `${art.label} – ${art.beschreibung}`
}

/** Wie sich die beiden Anforderungsniveaus unterscheiden (EPA Geographie, im Erdkunde-Hinweis zitiert). */
const NIVEAU_UNTERSCHIED: Record<Anforderungsniveau, string[]> = {
  gA: [
    'Akzentuiere die Anforderungsbereiche I und II.',
    'Ein Material, überschaubar in Umfang und Art.',
    'Die Teilaufgaben führen den Gedankengang; jede nennt, worauf zu achten ist.'
  ],
  eA: [
    'Akzentuiere die Anforderungsbereiche II und III.',
    'Mehr und vielfältigeres Material; die Verbindung zwischen den Materialien ist Teil der Leistung.',
    'Höherer Grad an Selbstständigkeit: keine Zwischenschritte vorgeben, Transfer über das Halbjahr hinaus verlangen.'
  ]
}

export function abiturRegeln(meta: WorksheetMeta): string {
  if (!abiturAktiv(meta)) return ''
  const v = meta.abitur!
  const profil = abiturProfil(meta.subjectId)!
  const niveau = v.niveau
  const afb = profil.afb[niveau]
  // In den Fremdsprachen sind Aufgabenart und Pruefungsteil dasselbe wie der Kompetenzschwerpunkt
  const art = aufgabenartFuer(meta, profil)
  const teil = profil.pruefungsteile?.find((p) => p.id === art)
  /*
   * Zeit und Textumfang richten sich nach dem GEWAEHLTEN Pruefungsteil.
   *
   * Gemeldet am 24.09.2026: Bei Sprachmittlung galten trotzdem die 225 Minuten und 1000
   * Woerter der Schreibaufgabe – der Text war „viel zu lang fuer 60 minuten".
   */
  const vorgaben = teilVorgaben(profil, niveau, teil?.id)

  const zeilen = [
    `ABITURBEZOGENE ${v.klausur ? 'ÜBUNGSKLAUSUR' : 'ÜBUNGSAUFGABE'} (${profil.label}, ${NIVEAU_LABEL[niveau]}):`,
    `- Aufgabenart: ${aufgabenartText(profil, art)}`,
    teil ? `- Prüfungsteil: ${teil.label} – ${teil.anteil} % der Gesamtbewertung, ${vorgaben.minuten} Minuten Bearbeitungszeit.` : '',
    ...NIVEAU_UNTERSCHIED[niveau].map((s) => `- ${s}`),
    `- Anforderungsbereiche als RICHTWERT: I ${afb.I} %, II ${afb.II} %, III ${afb.III} %. Schwerpunkt bleibt immer AFB II.`,
    vorgaben.woerter
      ? `- Umfang der Textvorlage: etwa ${vorgaben.woerter} Wörter, HÖCHSTENS ${Math.round(vorgaben.woerter * 1.15)} (bei mehreren Texten die Summe). Dieser Umfang ist auf die ${vorgaben.minuten} Minuten abgestimmt – ein längerer Text ist in der Zeit nicht zu bewältigen.`
      : '',
    '',
    'MATERIAL:',
    ...profil.material.map((s) => `- ${s}`),
    '',
    'AUFGABENSTELLUNG:',
    '- Wenige, aber komplexe Arbeitsanweisungen. Ein unzusammenhängendes Reihen von Einzelfragen ist nicht zulässig (EPA Geschichte).',
    '- Jede Teilaufgabe beginnt mit dem Operator und nennt das Material, auf das sie sich bezieht. Der Operator steht als korrekt gebildeter Imperativ – trennbare Verben mit der Vorsilbe am Satzende („Fassen Sie … zusammen", „Arbeiten Sie … heraus", „Ordnen Sie … ein"), nie „Zusammenfassen Sie …".',
    '- Die Teilaufgaben ergeben ein zusammenhängendes Ganzes; erkennbar ist, welche den Schwerpunkt bildet.',
    '',
    'ERWARTUNGSHORIZONT:',
    `- ${profil.bewertung}`,
    '- Zu jeder Teilaufgabe: erwartete Leistung, Anforderungsbereich und Gewichtung.',
    '- Im Erwartungshorizont nicht aufgeführte, aber gleichwertige Lösungen sind zu berücksichtigen – schreibe das dazu.'
  ]

  if (v.klausur) {
    zeilen.push(
      '',
      'DIE ÜBUNGSKLAUSUR BILDET DIE PRÜFUNGSSITUATION NACH:',
      `- Bearbeitungszeit ${vorgaben.minuten} Minuten${profil.auswahlzeit ? `, davon bzw. zuzüglich ${profil.auswahlzeit} Minuten Auswahlzeit` : ''}.`,
      profil.vorgelegt > profil.zuBearbeiten
        ? `- Im Abitur werden ${profil.vorgelegt} Aufgaben vorgelegt, ${profil.zuBearbeiten} sind zu bearbeiten. Erzeuge EINE vollständige Aufgabe und weise im Lehrkraft-Hinweis darauf hin.`
        : '',
      '- Nenne die zugelassenen Hilfsmittel.',
      /*
       * Wunsch der Lehrkraft (24.09.2026): Die Übungsklausur bekommt sprachliche Hilfsmittel,
       * „wie bei den anderen Arbeitsblättern", auf einer eigenen Seite.
       *
       * Eine bewusste Abweichung von der Prüfungswirklichkeit – im Abitur gibt es keine
       * Formulierungshilfen. Eine Übung ist aber zum Üben da; wer die Wendungen noch nicht
       * hat, kann die Aufgabe sonst gar nicht bewältigen. Auf einer EIGENEN Seite, damit sie
       * sich beim zweiten Durchgang weglassen lässt.
       */
      '- Keine Selbsteinschätzung und keine Tipps in der Aufgabe: In der Prüfung wird bewertet, nicht angeleitet.',
      '- Das sprachliche Gerüst steht auf einer EIGENEN Seite am Ende, nicht in der Aufgabe. Es richtet sich nach dem Niveau des Materials.'
    )
  }

  /*
   * Der Hinweis auf dem Blatt ist keine Förmlichkeit. Eine Übungsklausur, die aussieht wie
   * eine Abituraufgabe, wird auch dafür gehalten – von Lernenden wie von Kolleginnen. Sie
   * ist aber nicht vom Land gestellt und nicht geprüft.
   */
  zeilen.push(
    '',
    'EHRLICHKEIT ÜBER DEN STATUS:',
    '- Das ist eine ÜBUNGSaufgabe in Anlehnung an das Zentralabitur, KEINE amtliche Prüfungsaufgabe.',
    '- Schreibe das in teacherNote und setze es als kurze Zeile auf das Blatt.',
    '- Erfinde keine Angaben zu Prüfungsjahrgängen, Kompetenzbereichsnummern oder Kerncurriculum-Stellen.'
  )

  if (profil.offen) zeilen.push(`- Nicht amtlich vorgegeben und deshalb Richtwert: ${profil.offen}`)

  return zeilen.filter(Boolean).join('\n')
}

/** Kurze Zusammenfassung für die Anzeige in Schritt 1. */
export function abiturZusammenfassung(meta: WorksheetMeta): string[] {
  if (!abiturAktiv(meta)) return []
  const v = meta.abitur!
  const profil = abiturProfil(meta.subjectId)!
  const afb = profil.afb[v.niveau]
  const artId = aufgabenartFuer(meta, profil)
  const art = profil.aufgabenarten.find((a) => a.id === artId)?.label ?? profil.aufgabenarten[0].label
  const vorgaben = teilVorgaben(profil, v.niveau, artId)
  return [
    `${art} · ${NIVEAU_LABEL[v.niveau]}`,
    `Anforderungsbereiche etwa ${afb.I}/${afb.II}/${afb.III} %`,
    vorgaben.woerter ? `Textvorlage etwa ${vorgaben.woerter} Wörter` : '',
    v.klausur ? `Übungsklausur, ${vorgaben.minuten} Minuten` : 'Einzelne Übungsaufgabe',
    `Grundlage: ${profil.quelle}`
  ].filter(Boolean)
}
