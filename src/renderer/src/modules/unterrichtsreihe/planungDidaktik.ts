/**
 * Didaktische Grundlage der Reihenplanung (08.10.2026; fachtypische Reihenmuster seit dem Abend in `reihenmusterZeilen`): Die KI plante
 * bisher nur mit Kürzeln („Schulform gymnasium, Bundesland NI") und ohne das Lerngruppen-Profil, das jedes Arbeitsblatt
 * bekommt. Jetzt gehen an die Planung:
 *  - Land und Schulform ausgeschrieben (shared/schulformen.ts, didactics/states.ts);
 *  - das volle Lerngruppen-Profil des Arbeitsblatts (`buildLearnerProfile` → `promptRules`), verschoben um das Niveau der
 *    Reihe (`profilFuerStufe`, wie beim Arbeitsblatt);
 *  - die Operatorenliste des Landes für Fach, Stufe und Schulform (shared/operatoren/zugriff.ts);
 *  - die Regeln der Altersstufe (didactics/ageBands.ts);
 *  - das Niveau der Reihe in Worten.
 */
import { NIVEAU_STANDARD, type Reihe, type ReiheNiveau } from '@shared/reihe'
import { SCHULFORMEN, schulformVon } from '@shared/schulformen'
import { reihenmusterFuer, reihentypVon, stufenHinweis, type Reihentyp } from '@shared/reihenmuster'
import { fachVon } from '@shared/faecher'
import { operatorenAuswahl } from '@shared/operatoren/zugriff'
import { buildLearnerProfile } from '../arbeitsblatt/didactics/profile'
import { ageBandForGrade } from '../arbeitsblatt/didactics/ageBands'
import { stateInfo } from '../arbeitsblatt/didactics/states'
import { profilFuerStufe, stufeText } from '../arbeitsblatt/didactics/schwierigkeit'
import { subjectById } from '../arbeitsblatt/model/subjects'

type Basis = Pick<Reihe, 'stateId' | 'schoolTypeId' | 'grade' | 'fachId' | 'fachLabel'> & Pick<Partial<Reihe>, 'niveau'>

/** „Gymnasium" statt „gymnasium" (unbekannt: die Kennung) */
export const schulformName = (r: Pick<Reihe, 'stateId' | 'schoolTypeId'>): string =>
  SCHULFORMEN[r.stateId]?.find((f) => f.id === r.schoolTypeId)?.name ?? r.schoolTypeId

/** „Niedersachsen" statt „NI" */
export const landName = (r: Pick<Reihe, 'stateId'>): string => (r.stateId ? stateInfo(r.stateId).name : '')

/** Niveau der Reihe (ohne Angabe: jahrgangsgemäß, ein Niveau) */
export const niveauVon = (r: Pick<Partial<Reihe>, 'niveau'>): ReiheNiveau => ({ ...NIVEAU_STANDARD, ...(r.niveau ?? {}) })

/** Das Niveau in Worten für die KI */
export function niveauZeile(n: ReiheNiveau): string {
  const stufe = stufeText({ anspruch: n.anspruch, sprache: n.sprache })
  return `NIVEAU DER REIHE: ${stufe} (relativ zum Jahrgang; „mittel" = jahrgangsgemäß).${
    n.stufen > 1
      ? ` Die Lerngruppe arbeitet in ${n.stufen} Niveaustufen: Arbeitsblätter entstehen in ${n.stufen} Fassungen; plane dazu Förder- und Forderschritte gezielt ein.`
      : ''
  }`
}

/** Lerngruppen-Profil wie beim Arbeitsblatt – um das Niveau der Reihe verschoben */
export function reihenProfil(r: Basis): ReturnType<typeof buildLearnerProfile> {
  const fach = subjectById(r.fachId)
  const profil = buildLearnerProfile({
    stateId: r.stateId,
    schoolTypeId: r.schoolTypeId,
    schoolTypeName: schulformName(r),
    grade: r.grade,
    courseLevel: 'mixed',
    subjectId: fach.id,
    subjectLabel: fach.label || r.fachLabel,
    languageMode: 'standard'
  })
  const n = niveauVon(r)
  return profilFuerStufe(profil, { anspruch: n.anspruch, sprache: n.sprache })
}

/** Operatoren der Landesliste nach Anforderungsbereich (leer, wenn es für das Fach keine Liste gibt) */
export function operatorenZeile(r: Basis): string {
  const a = operatorenAuswahl({ stateId: r.stateId, fach: r.fachId, stufe: r.grade >= 11 ? 'sek2' : 'sek1', schulform: r.schoolTypeId })
  if (!a) return ''
  const nachAfb = new Map<string, string[]>()
  for (const o of a.operatoren) {
    if (!o.definition.trim()) continue
    const k = o.afb ? String(o.afb) : 'ohne Zuordnung'
    const liste = nachAfb.get(k) ?? []
    if (!liste.includes(o.operator)) liste.push(o.operator)
    nachAfb.set(k, liste)
  }
  if (!nachAfb.size) return ''
  const zeilen = [...nachAfb].map(([afb, ops]) => `- AFB ${afb}: ${ops.slice(0, 25).join(', ')}`)
  return `OPERATOREN (${a.quelle}) – in Beschreibungen und Titeln der Schritte nur diese verwenden:\n${zeilen.join('\n')}`
}

/** Regeln der Altersstufe – Umfang, Formate, Hilfen */
export function altersZeile(grade: number): string {
  const b = ageBandForGrade(grade)
  const hilfen = b.scaffolding === 'hoch' ? 'umfangreich' : b.scaffolding === 'mittel' ? 'gezielt' : 'nur optional'
  return [
    `ALTERSSTUFE (${b.label}): je Aufgabe etwa ${b.minutesPerTask[0]}–${b.minutesPerTask[1]} Minuten; Hilfen ${hilfen}`,
    b.exampleFirst ? '; Übungen beginnen mit einem gelösten Beispiel' : '',
    b.instructionSymbols ? '; je Arbeitsanweisung nur eine Handlung' : '',
    `. Formate: ${b.formats}.`
  ].join('')
}

/**
 * Fachtypisches Reihenmuster (08.10.2026, shared/reihenmuster.ts) für Fach, Stufe und Schulform: Reihentyp (gewählt
 * oder zur Wahl), Phasen als Funktionen, Einstiege, Material, Methoden, Sicherung, Abschluss, Lernkarten, Stufe,
 * Schulform und die harten Regeln. Leer, wenn das Fach kein Muster hat.
 */
export function reihenmusterZeilen(r: Basis & Pick<Partial<Reihe>, 'reihentyp'>): string[] {
  const m = reihenmusterFuer(r.fachId)
  if (!m) return []
  const typ = reihentypVon(m, r.reihentyp)
  const stufe = stufenHinweis(m, r.grade)
  const sf = schulformVon(r.stateId, r.schoolTypeId)
  const sfHinweis = sf ? (sf.beruflich ? m.schulformHinweise.beruflich : undefined) ?? m.schulformHinweise[sf.profil] : undefined
  const fach = m.fachHinweise?.[r.fachId]
  const typZeile = (t: Reihentyp): string => `- ${t.id}: ${t.label} – ${t.phasen.join(' → ')}`
  return [
    `FACHTYPISCHES REIHENMUSTER (${m.name}${stufe ? `, Stufe ${stufe.stufe}` : ''}${sf ? `, ${sf.name}` : ''}):`,
    typ
      ? `REIHENTYP (von der Lehrkraft gewählt – "reihentyp" = "${typ.id}"):\n${typZeile(typ)}`
      : `REIHENTYP: Wähle den passenden Typ für Thema, Stufe und Lernziele und trage seine Kennung in "reihentyp" ein:\n${m.reihentypen.map(typZeile).join('\n')}`,
    '- Die Phasen sind didaktische FUNKTIONEN, keine starre Reihenfolge: Sie dürfen sich je Teilthema wiederholen und ineinandergreifen; nicht jede Phase braucht einen eigenen Schritt.',
    `- Geeignete Einstiege: ${m.einstiege.join('; ')}`,
    `- Ungeeignet als Einstieg: ${m.ungeeigneteEinstiege.join('; ')}`,
    `- Materialarten: ${m.materialarten.join('; ')}`,
    `- Methoden: ${m.methoden.join('; ')}`,
    `- Sicherung: ${m.sicherung.join('; ')}`,
    `- Abschlussprodukte: ${m.abschlussprodukte.join('; ')}`,
    `- Lernkarten: ${m.lernkartenNutzung}`,
    stufe ? `- Stufe ${stufe.stufe}: ${stufe.text}` : '',
    sfHinweis ? `- Schulform: ${sfHinweis}` : '',
    fach ? `- ${fachVon(r.fachId)?.label ?? r.fachLabel}: ${fach}` : '',
    `NIE (harte Regeln, nicht abwägen):\n${m.nieRegeln.map((n) => `- ${n}`).join('\n')}`
  ].filter(Boolean)
}

/** Alle didaktischen Zeilen für die Planungsanfrage */
export function planungsDidaktik(r: Basis): string[] {
  const p = reihenProfil(r)
  return [
    niveauZeile(niveauVon(r)),
    `LERNGRUPPENPROFIL (gilt für alle Materialien der Reihe):\n${p.promptRules.map((z) => `- ${z}`).join('\n')}`,
    altersZeile(r.grade),
    operatorenZeile(r)
  ].filter(Boolean)
}
