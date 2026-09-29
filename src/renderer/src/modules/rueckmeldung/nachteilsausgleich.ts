/**
 * Nachteilsausgleich und Notenschutz in der Rückmeldung (29.09.2026, Wunsch der Lehrkraft):
 * je Abgabe über ein Fenster wählbar – Vorschläge aus der Recherche und eine eigene Angabe.
 *
 * ABGRENZUNG (so in allen Ländern, im Einzelnen in laenderRegeln.ts mit Fundstelle):
 * - NACHTEILSAUSGLEICH passt die Bedingungen an (Zeit, Hilfsmittel, Form), die fachlichen
 *   Anforderungen bleiben gleich; er steht nicht im Zeugnis.
 * - NOTENSCHUTZ bzw. „Abweichen von den allgemeinen Grundsätzen der Leistungsbewertung"
 *   verzichtet auf die Bewertung einzelner Leistungen (z. B. der Rechtschreibung). Er setzt
 *   einen Beschluss der Schule voraus und wird in mehreren Ländern im Zeugnis vermerkt.
 * - Zieldifferente Förderung ist KEIN Nachteilsausgleich (andere Lernziele) – eigene Gruppe.
 * Über Art und Umfang entscheidet die Schule (meist die Klassenkonferenz); die App setzt nur
 * um, was die Lehrkraft hier einträgt.
 *
 * DATENSCHUTZ: Diagnosen sind Gesundheitsdaten (Art. 9 DSGVO). An die KI gehen deshalb nur
 * die MASSNAHMEN („Rechtschreibung nicht bewerten"), nie die Ursache. Die Hinweise „typisch
 * bei …" stehen nur in der Oberfläche, und die eigene Angabe wird vor der Anfrage von
 * Diagnosewörtern bereinigt (`ohneDiagnosen`).
 *
 * Quellen der Maßnahmen: KMK-Beschluss LRS/Rechnen (2003 i. d. F. 2007); BaySchO §§ 31–36 und
 * ISB-Handbuch „Individuelle Unterstützung, Nachteilsausgleich, Notenschutz" (2024); BVL-Leitfaden
 * Nachteilsausgleich (2019); autismus Deutschland e. V.; ADHS Deutschland e. V.
 */
import type { Nachteilsausgleich } from './model/types'

export type AusgleichGruppe = 'notenschutz' | 'bedingung' | 'daz' | 'form' | 'zieldifferent'

export interface AusgleichMassnahme {
  id: string
  gruppe: AusgleichGruppe
  label: string
  /** Nur für die Oberfläche – geht NIE an die KI */
  typisch?: string
  /** Vorbehalt der Länder (aus der Recherche), in der Oberfläche unter der Maßnahme */
  vorbehalt?: string
  /** Anweisung an die KI (ohne Diagnose) */
  ki: string
}

export const GRUPPEN: { id: AusgleichGruppe; titel: string; hinweis: string }[] = [
  {
    id: 'notenschutz',
    titel: 'Notenschutz (anderer Bewertungsmaßstab)',
    hinweis: 'Nur mit förmlichem Beschluss der Schule; wird fast überall im Zeugnis vermerkt, in Abschlussjahrgängen und in der Oberstufe meist ausgeschlossen.'
  },
  {
    id: 'bedingung',
    titel: 'Nachteilsausgleich: Bedingungen, die die Rückmeldung berücksichtigt',
    hinweis: 'Gleicher Maßstab, andere Bedingungen – kein Zeugnisvermerk. Die Rückmeldung wertet nur nicht, was der Ausgleich erlaubt hat.'
  },
  { id: 'daz', titel: 'Deutsch als Zweitsprache', hinweis: 'Sprachliche und fachliche Leistung getrennt sehen.' },
  { id: 'form', titel: 'Gestaltung des Bogens für die Person', hinweis: 'Ändert nur die Form der Rückmeldung, nicht die Bewertung – in allen Ländern unbedenklich.' },
  {
    id: 'zieldifferent',
    titel: 'Zieldifferente Förderung (kein Nachteilsausgleich)',
    hinweis: 'Maßstab sind die individuellen Lernziele – diese im Feld darunter nennen.'
  }
]

export const MASSNAHMEN: AusgleichMassnahme[] = [
  // --- Notenschutz (Gruppe A der Recherche) ---
  {
    id: 'ns-rechtschreibung',
    gruppe: 'notenschutz',
    label: 'Rechtschreibung nicht bewerten',
    typisch: 'typisch bei Lese-Rechtschreib-Schwierigkeiten',
    ki: 'NOTENSCHUTZ: Rechtschreibfehler fließen NICHT in Einstufung, Punkte, Tabelle oder Kriterien ein und stehen nicht unter „nächste Schritte". Am Rand höchstens freundliche Hinweise zu 1–2 häufigen Wörtern, als Hinweis ohne Wertung.'
  },
  {
    id: 'ns-rs-kennzeichnen',
    gruppe: 'notenschutz',
    label: 'Rechtschreibung kennzeichnen, aber nicht bewerten',
    typisch: 'so im Saarland und in Sachsen-Anhalt vorgesehen',
    ki: 'NOTENSCHUTZ: Rechtschreibfehler werden am Rand gekennzeichnet (Zeichen R), fließen aber NICHT in Einstufung, Punkte, Tabelle oder Kriterien ein.'
  },
  {
    id: 'ns-sprachrichtigkeit',
    gruppe: 'notenschutz',
    label: 'Rechtschreibung bzw. Sprachrichtigkeit zurückhaltend gewichten',
    typisch: 'in Deutsch und Fremdsprachen (z. B. BW, NW, HB, SH)',
    ki: 'NOTENSCHUTZ: Rechtschreibung bzw. sprachliche Richtigkeit wird nur zurückhaltend gewichtet (höchstens etwa eine Notenstufe Unterschied); die Einstufung richtet sich vor allem nach Inhalt und Aufbau.'
  },
  {
    id: 'ns-form',
    gruppe: 'notenschutz',
    label: 'Schrift und äußere Form nicht bewerten',
    typisch: 'typisch bei motorischen Einschränkungen',
    ki: 'NOTENSCHUTZ: Schriftbild, Heftführung und äußere Form werden nicht bewertet und nicht kritisiert.'
  },
  {
    id: 'ns-teile',
    gruppe: 'notenschutz',
    label: 'Nicht erbringbare Aufgabenteile nicht bewerten',
    typisch: 'z. B. visuell oder motorisch gebundene Teile (BaySchO § 34)',
    ki: 'NOTENSCHUTZ: Aufgabenteile, die die Person wegen einer Beeinträchtigung nicht erbringen kann (siehe Angabe der Lehrkraft), werden nicht bewertet; die Einstufung bezieht sich nur auf die übrigen Teile.'
  },
  {
    id: 'ns-individuell',
    gruppe: 'notenschutz',
    label: 'Individuelle Bezugsnorm, Lernfortschritt würdigen',
    typisch: 'z. B. MV, RP, ST; bei DaZ in HE',
    ki: 'Die Rückmeldung misst an der individuellen Entwicklung: Lernfortschritte und Anstrengung ausdrücklich würdigen; der Vergleich mit der Lerngruppe tritt zurück.'
  },
  // --- Bedingungen (Gruppe B) ---
  {
    id: 'zeit',
    gruppe: 'bedingung',
    label: 'Mit verlängerter Bearbeitungszeit geschrieben',
    ki: 'Die Arbeit entstand mit verlängerter Bearbeitungszeit (Nachteilsausgleich). Maßstab und Anforderungen bleiben gleich; Umfang und Vollständigkeit am verlängerten Zeitrahmen messen, die Zeit nicht erwähnen.'
  },
  {
    id: 'computer',
    gruppe: 'bedingung',
    label: 'Am Computer geschrieben, Rechtschreibprüfung erlaubt',
    vorbehalt: 'Länder ordnen die Rechtschreibprüfung unterschiedlich ein (HE, SL: Abweichen; MV: Nachteilsausgleich).',
    ki: 'Die Arbeit wurde am Computer mit erlaubter Rechtschreibprüfung geschrieben. Rechtschreibung und Schriftbild sind deshalb kein Maßstab; übrige Anforderungen bleiben gleich.'
  },
  {
    id: 'diktiert',
    gruppe: 'bedingung',
    label: 'Antwort diktiert, Spracherkennung oder Schreibassistenz',
    typisch: 'typisch bei motorischen Einschränkungen',
    ki: 'Die Antwort wurde diktiert bzw. mit Spracherkennung oder Schreibassistenz aufgeschrieben. Rechtschreibung, Schrift und Form stammen nicht von der Person und werden nicht bewertet.'
  },
  {
    id: 'woerterbuch',
    gruppe: 'bedingung',
    label: 'Wörterbuch erlaubt',
    ki: 'Ein Wörterbuch war erlaubt. Die Nutzung wird nicht kritisiert; Fehler trotz Wörterbuch werden normal behandelt.'
  },
  {
    id: 'rechenhilfen',
    gruppe: 'bedingung',
    label: 'Rechenhilfen erlaubt (Taschenrechner, Einmaleinstafel)',
    typisch: 'typisch bei Rechenschwierigkeiten',
    vorbehalt: 'Nur, wo das Rechnen selbst nicht geprüft wird; Bayern gewährt bei Rechenstörung keinen Nachteilsausgleich.',
    ki: 'Rechenhilfen (Taschenrechner, Einmaleinstafel) waren erlaubt. Bewertet werden Modellierung und Lösungsweg; Rechenwege mit Hilfsmitteln gelten als vollwertig.'
  },
  {
    id: 'vorgelesen',
    gruppe: 'bedingung',
    label: 'Aufgabe wurde vorgelesen',
    ki: 'Die Aufgabenstellung wurde vorgelesen. Missverständnisse, die das Vorlesen ausgleichen sollte, werden nicht angelastet.'
  },
  {
    id: 'toleranz',
    gruppe: 'bedingung',
    label: 'Toleranz bei Genauigkeit (Zeichnen, Geometrie, Schriftbild)',
    typisch: 'bei motorischen oder Seheinschränkungen',
    ki: 'Ungenauigkeiten beim Zeichnen, Messen und im Schriftbild innerhalb eines großzügigen Toleranzrahmens werden nicht angelastet.'
  },
  {
    id: 'muendlich',
    gruppe: 'bedingung',
    label: 'Teile mündlich statt schriftlich erbracht',
    ki: 'Teile der Leistung wurden mündlich statt schriftlich erbracht (siehe Angabe der Lehrkraft). Die Form ist nicht Gegenstand der Bewertung.'
  },
  {
    id: 'umfang',
    gruppe: 'bedingung',
    label: 'Reduzierter Aufgabenumfang bei gleichem Niveau',
    vorbehalt: 'Nur, wo das Land ihn als Nachteilsausgleich zulässt (z. B. HB, SH); in Bayern unzulässig, im Saarland ein Abweichen.',
    ki: 'Die Aufgabenmenge war reduziert, das Anforderungsniveau nicht. Bewertet werden Qualität und Niveau der bearbeiteten Teile, nicht die Menge.'
  },
  // --- DaZ ---
  {
    id: 'daz-sprache',
    gruppe: 'daz',
    label: 'Sprachfehler getrennt ausweisen, nicht in die Fachbewertung',
    vorbehalt: 'In Baden-Württemberg Notenschutz nach § 17 SprachbildungsVO (mit Zeugnisvermerk).',
    ki: 'Die Person lernt Deutsch als Zweitsprache. Sprachliche Fehler, die zum Erwerb des Deutschen gehören, werden getrennt als sprachliche Hinweise genannt und fließen NICHT in die fachliche Einstufung ein. Verständlichkeit geht vor sprachlicher Korrektheit; fachlich richtige Gedanken zählen.'
  },
  {
    id: 'daz-woerterbuch',
    gruppe: 'daz',
    label: 'Zweisprachiges Wörterbuch erlaubt',
    ki: 'Ein zweisprachiges Wörterbuch war erlaubt. Die Nutzung wird nicht kritisiert.'
  },
  // --- Form des Bogens (Gruppe C) ---
  {
    id: 'einfach',
    gruppe: 'form',
    label: 'Einfache Sprache, kurze Sätze',
    ki: 'Schreibe den Bogen in einfacher Sprache: kurze Hauptsätze, bekannte Wörter, ein Gedanke je Satz.'
  },
  {
    id: 'struktur',
    gruppe: 'form',
    label: 'Klar gegliedert, wenige Punkte auf einmal',
    ki: 'Gliedere klar: kurze Punkte statt Fließtext, jeder Punkt eine Aussage.'
  },
  {
    id: 'kleinschrittig',
    gruppe: 'form',
    label: 'Höchstens zwei nächste Schritte, kleinschrittig',
    typisch: 'hilfreich bei Konzentrationsschwierigkeiten',
    ki: 'Nenne höchstens ZWEI nächste Schritte, jeweils klein, konkret und sofort umsetzbar.'
  },
  {
    id: 'woertlich',
    gruppe: 'form',
    label: 'Klar und wörtlich, ohne Redewendungen und Ironie',
    typisch: 'hilfreich im Autismus-Spektrum',
    ki: 'Formuliere eindeutig, sachlich und wörtlich: keine Redewendungen, keine Ironie, keine Andeutungen, keine emotionalen Umschreibungen. Sage genau, was gemeint ist und was als Nächstes zu tun ist.'
  },
  {
    id: 'richtiges',
    gruppe: 'form',
    label: 'Richtiges hervorheben, Rechtschreibung nicht in den Mittelpunkt',
    ki: 'Hebe hervor, was richtig ist; die Rechtschreibung steht nicht im Mittelpunkt der Rückmeldung.'
  },
  {
    id: 'ermutigend',
    gruppe: 'form',
    label: 'Besonders ermutigend, Stärken und Fortschritte zuerst',
    ki: 'Beginne mit den Stärken, würdige Anstrengung und Fortschritt und formuliere besonders ermutigend und belastungsarm, ohne die Ehrlichkeit aufzugeben.'
  },
  {
    id: 'grossdruck',
    gruppe: 'form',
    label: 'Großdruck und hoher Kontrast im Ausdruck',
    typisch: 'bei Sehbeeinträchtigung',
    ki: ''
  },
  {
    id: 'audio',
    gruppe: 'form',
    label: 'Bogen zusätzlich zum Anhören',
    typisch: 'bei Lese- oder Sehbeeinträchtigung',
    ki: 'Der Bogen wird auch vorgelesen: Schreibe so, dass er gut klingt – keine Klammern, keine Abkürzungen, keine Sonderzeichen.'
  },
  // --- Zieldifferent ---
  {
    id: 'zieldifferent',
    gruppe: 'zieldifferent',
    label: 'Zieldifferent – Maßstab sind die individuellen Lernziele',
    ki: 'Die Person wird zieldifferent gefördert. Maßstab sind ihre individuellen Lernziele (siehe Angabe der Lehrkraft), nicht der Erwartungshorizont der Lerngruppe.'
  }
]

export const massnahme = (id: string): AusgleichMassnahme | undefined => MASSNAHMEN.find((m) => m.id === id)

export const hatAusgleich = (a: Nachteilsausgleich | undefined): boolean => Boolean(a && (a.massnahmen.length || a.eigene?.trim()))
export const hatMassnahme = (a: Nachteilsausgleich | undefined, id: string): boolean => Boolean(a?.massnahmen.includes(id))
export const hatNotenschutz = (a: Nachteilsausgleich | undefined): boolean => Boolean(a?.massnahmen.some((id) => massnahme(id)?.gruppe === 'notenschutz'))
/** Rechtschreibung zählt nicht (Notenschutz, Diktat, Computer mit Rechtschreibprüfung) */
export const ohneRechtschreibung = (a: Nachteilsausgleich | undefined): boolean =>
  ['ns-rechtschreibung', 'ns-rs-kennzeichnen', 'diktiert', 'computer'].some((id) => hatMassnahme(a, id))

/** Kurzform für Übersichten der Lehrkraft (nie auf dem Bogen der Lernenden) */
export function ausgleichKurz(a: Nachteilsausgleich | undefined): string {
  if (!hatAusgleich(a)) return ''
  return [hatNotenschutz(a) ? 'NS' : '', a!.massnahmen.some((id) => massnahme(id)?.gruppe !== 'notenschutz') || a!.eigene?.trim() ? 'NA' : '']
    .filter(Boolean)
    .join('+')
}

/**
 * Diagnose- und Krankheitswörter, die nicht zur KI gehen. Bewusst großzügig: Lieber ein Wort
 * zu viel ersetzen als eine Diagnose verschicken.
 */
const DIAGNOSEN =
  /\b(legasthen[\wäöüÄÖÜß]*|lrs|lese[- ]?rechtschreib[- ]?[\wäöüÄÖÜß]*|dyslexi[\wäöüÄÖÜß]*|dyskalkul[\wäöüÄÖÜß]*|rechenschw[aä]ch[\wäöüÄÖÜß]*|rechenst[oö]rung[\wäöüÄÖÜß]*|adhs|ads|aufmerksamkeitsdefizit[\wäöüÄÖÜß]*|hyperaktiv[\wäöüÄÖÜß]*|autis[\wäöüÄÖÜß]*|asperger[\wäöüÄÖÜß]*|tourette[\wäöüÄÖÜß]*|mutismus|depressi[\wäöüÄÖÜß]*|angstst[oö]rung[\wäöüÄÖÜß]*|panik[\wäöüÄÖÜß]*|essst[oö]rung[\wäöüÄÖÜß]*|magersucht|epilep[\wäöüÄÖÜß]*|diabet[\wäöüÄÖÜß]*|chronisch[\wäöüÄÖÜß]*|krank[\wäöüÄÖÜß]*|diagnos[\wäöüÄÖÜß]*|gutachten|attest[\wäöüÄÖÜß]*|behinder[\wäöüÄÖÜß]*|schwerh[oö]rig[\wäöüÄÖÜß]*|geh[oö]rlos[\wäöüÄÖÜß]*|h[oö]rsch[aä]dig[\wäöüÄÖÜß]*|sehbehind[\wäöüÄÖÜß]*|blind[\wäöüÄÖÜß]*|f[oö]rderschwerpunkt[\wäöüÄÖÜß]*|sonderp[aä]dagog[\wäöüÄÖÜß]*|therapie[\wäöüÄÖÜß]*|trauma[\wäöüÄÖÜß]*|ptbs|lernbehind[\wäöüÄÖÜß]*|dysgraph[\wäöüÄÖÜß]*|dyspraxi[\wäöüÄÖÜß]*|lähmung[\wäöüÄÖÜß]*|spastik[\wäöüÄÖÜß]*)\b/gi

/** Entfernt Diagnosewörter aus der eigenen Angabe; liefert auch, was entfernt wurde */
export function ohneDiagnosen(text: string): { text: string; entfernt: string[] } {
  const entfernt: string[] = []
  const sauber = text.replace(DIAGNOSEN, (w) => {
    entfernt.push(w)
    return '[entfernt]'
  })
  return { text: sauber, entfernt }
}

/** Die Zeilen für die KI-Anfrage – nur Maßnahmen, keine Diagnosen */
export function ausgleichAnweisung(a: Nachteilsausgleich | undefined): string {
  if (!hatAusgleich(a)) return ''
  const zeilen = a!.massnahmen
    .map((id) => massnahme(id)?.ki)
    .filter((k): k is string => Boolean(k))
    .map((k) => `- ${k}`)
  const eigene = a!.eigene?.trim() ? ohneDiagnosen(a!.eigene.trim()).text : ''
  if (eigene) zeilen.push(`- Angabe der Lehrkraft: ${eigene}`)
  if (!zeilen.length) return ''
  return ['NACHTEILSAUSGLEICH / NOTENSCHUTZ (von der Schule festgelegt – unbedingt einhalten, im Bogen NICHT erwähnen):', ...zeilen].join('\n')
}

/** Höchstzahl der nächsten Schritte (kleinschrittig: 2) */
export const maxSchritte = (a: Nachteilsausgleich | undefined): number => (hatMassnahme(a, 'kleinschrittig') ? 2 : 3)

// ---------- Gedächtnis je Person (nur auf diesem Rechner) ----------

/** Schlüssel eines Namens: klein, ohne doppelte Leerzeichen */
export const namensSchluessel = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

export interface AusgleichGedaechtnis {
  eintraege: Record<string, Nachteilsausgleich & { name: string; aktualisiert: string }>
}

export const GEDAECHTNIS_ID = 'personen'

export function gemerkterAusgleich(g: AusgleichGedaechtnis | null, name: string): Nachteilsausgleich | null {
  if (!g || !name.trim()) return null
  const e = g.eintraege[namensSchluessel(name)]
  return e && hatAusgleich(e) ? { massnahmen: [...e.massnahmen], ...(e.eigene ? { eigene: e.eigene } : {}) } : null
}

export function merkeAusgleich(g: AusgleichGedaechtnis | null, name: string, a: Nachteilsausgleich | null, jetzt = new Date()): AusgleichGedaechtnis {
  const neu: AusgleichGedaechtnis = { eintraege: { ...(g?.eintraege ?? {}) } }
  const key = namensSchluessel(name)
  if (!key) return neu
  if (!a || !hatAusgleich(a)) delete neu.eintraege[key]
  else neu.eintraege[key] = { name: name.trim(), massnahmen: [...a.massnahmen], ...(a.eigene?.trim() ? { eigene: a.eigene.trim() } : {}), aktualisiert: jetzt.toISOString() }
  return neu
}
