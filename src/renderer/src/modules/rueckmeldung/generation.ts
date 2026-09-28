/**
 * Rückmeldung (Großprogramm 0.4, F3): Grundlage aus gespeichertem Material, Übertragen von
 * Fotos/Scans in Text, Rückmeldebogen ohne Note.
 */
import type { StructuredRequest } from '@shared/types'
import { ersetzeNamen, findeNamen, type Zuordnung } from '@shared/pseudonymisierung'
import { arr, enumOf, obj, str } from '../../shared/aiSchema'
import { describeBlock, describeSheet } from '../arbeitsblatt/generation/describe'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { normalisiereArbeit } from '../klassenarbeit/model/fassungen'
import type { Exam } from '../klassenarbeit/model/types'
import { examToWorksheet } from '../klassenarbeit/render/examWorksheet'
import type { GrammarTest } from '../grammatiktest/model/types'
import { testToWorksheet } from '../grammatiktest/render/testWorksheet'
import type { Kurztest } from '../lernzielkontrolle/model/types'
import { kurztestToWorksheet } from '../lernzielkontrolle/render/kurztestWorksheet'
import { describeBlock as vokabelBlock } from '../vokabeltest/generation/quality'
import { LANGUAGES, type TestDocument } from '../vokabeltest/model/types'
import { fachIdVon } from '../../shared/fachfarben'
import type { Abgabe, Bogen, Einschaetzung, Grundlage, GrundlageArt, Rueckmeldung } from './model/types'

// ---------- Grundlage aus gespeichertem Material ----------

/** Aufgaben und Erwartungshorizont eines Arbeitsblatts (auch umgewandelte Arbeiten und Tests) */
export function grundlageAusBlatt(ws: Worksheet, art: GrundlageArt, docId: string, titel: string): Grundlage {
  const aufgaben = ws.sheets.map((s) => (ws.sheets.length > 1 ? `[${s.label}]\n` : '') + describeSheet(s)).join('\n\n')
  const loesungen = ws.sheets
    .flatMap((s) => s.blocks)
    .filter((b) => b.type === 'task' && b.solution?.trim())
    .map((b, i) => `Aufgabe ${i + 1}: ${(b as { solution: string }).solution.trim()}`)
  return { art, docId, titel, aufgaben, ...(loesungen.length ? { erwartung: loesungen.join('\n') } : {}) }
}

/**
 * Vokabeltest als Grundlage: die Aufgaben der ersten Fassung mit ihren Lösungen („→ answer").
 * Rückmeldung passt hier vor allem zu Aufgaben mit eigenen Sätzen; Lücken und Zuordnungen
 * zeigen, welche Wörter noch nicht sitzen.
 */
export function grundlageAusVokabeltest(doc: TestDocument, docId: string, titel: string): Grundlage {
  const bloecke = doc.variants[0]?.blocks ?? []
  return {
    art: 'vokabeltest',
    docId,
    titel,
    aufgaben: bloecke.map((b, i) => `Aufgabe ${i + 1}\n${vokabelBlock(b)}`).join('\n\n'),
    erwartung: 'Die Lösungen stehen in den Aufgaben hinter „→ answer" bzw. „→ model answer".'
  }
}

export interface MaterialEintrag {
  art: Exclude<GrundlageArt, 'frei'>
  id: string
  name: string
  fach: string
  updatedAt: string
}

export const ART_TITEL: Record<Exclude<GrundlageArt, 'frei'>, string> = {
  arbeitsblatt: 'Arbeitsblatt',
  klassenarbeit: 'Klassenarbeit',
  lernzielkontrolle: 'Lernzielkontrolle',
  grammatiktest: 'Grammatiktest',
  vokabeltest: 'Vokabeltest'
}

/** Alle gespeicherten Materialien, aus denen eine Rückmeldung entstehen kann – neueste zuerst */
export async function materialListe(): Promise<MaterialEintrag[]> {
  const [ab, ka, lzk, gt, vt] = await Promise.all([
    window.api.sheets.list().catch(() => []),
    window.api.exams.list().catch(() => []),
    window.api.kurztests.list().catch(() => []),
    window.api.grammarTests.list().catch(() => []),
    window.api.tests.list().catch(() => [])
  ])
  const eintrag = (art: MaterialEintrag['art']) => (m: { id: string; name: string; updatedAt: string; subjectLabel?: string }) => ({
    art,
    id: m.id,
    name: m.name,
    fach: m.subjectLabel ?? '',
    updatedAt: m.updatedAt
  })
  return [
    ...ab.map(eintrag('arbeitsblatt')),
    ...ka.map(eintrag('klassenarbeit')),
    ...lzk.map(eintrag('lernzielkontrolle')),
    ...gt.map(eintrag('grammatiktest')),
    ...vt.map(eintrag('vokabeltest'))
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Lädt ein gespeichertes Material und macht daraus die Grundlage */
export async function ladeGrundlage(
  art: MaterialEintrag['art'],
  id: string
): Promise<{ grundlage: Grundlage; fach: { id: string; label: string; grade: number } }> {
  if (art === 'arbeitsblatt') {
    const s = await window.api.sheets.get(id)
    const ws = s.payload as Worksheet
    return { grundlage: grundlageAusBlatt(ws, art, id, s.name), fach: { id: ws.meta.subjectId, label: ws.meta.subjectLabel, grade: ws.meta.grade } }
  }
  if (art === 'klassenarbeit') {
    const s = await window.api.exams.get(id)
    const e = normalisiereArbeit(s.payload as Exam)
    return {
      grundlage: grundlageAusBlatt(examToWorksheet(e, 0), art, id, s.name),
      fach: { id: e.meta.subjectId, label: e.meta.subjectLabel, grade: e.meta.grade }
    }
  }
  if (art === 'lernzielkontrolle') {
    const s = await window.api.kurztests.get(id)
    const t = s.payload as Kurztest
    return {
      grundlage: grundlageAusBlatt(kurztestToWorksheet(t, 0), art, id, s.name),
      fach: { id: t.meta.subjectId, label: t.meta.subjectLabel, grade: t.meta.grade }
    }
  }
  if (art === 'vokabeltest') {
    const s = await window.api.tests.get(id)
    // Die Bibliothek legt Wörter, Einstellungen und den erzeugten Test zusammen ab
    const doc = (s.payload as { doc?: TestDocument | null }).doc
    if (!doc?.variants?.length) throw new Error('Dieser Vokabeltest hat noch keine Aufgaben – erst den Test erstellen.')
    const sprache = LANGUAGES.find((l) => l.value === doc.settings.targetLanguage)?.label ?? doc.settings.targetLanguage
    return {
      grundlage: grundlageAusVokabeltest(doc, id, s.name),
      fach: { id: fachIdVon(doc.settings.targetLanguage) ?? fachIdVon(sprache) ?? 'englisch', label: sprache, grade: doc.settings.grade }
    }
  }
  const s = await window.api.grammarTests.get(id)
  const t = s.payload as GrammarTest
  return { grundlage: grundlageAusBlatt(testToWorksheet(t), art, id, s.name), fach: { id: t.meta.subjectId, label: t.meta.subjectLabel, grade: t.meta.grade } }
}

// ---------- Foto/Scan → Text ----------

const TRANSKRIPT = obj({
  text: str('Der Text der Schülerarbeit, Wort für Wort übertragen – mit allen Fehlern, nichts verbessert'),
  unleserlich: str('Stellen, die sich nicht sicher lesen ließen, kurz genannt – sonst leer'),
  erkannteNamen: arr(str('Personennamen, die in der Arbeit stehen (Name im Kopf, Unterschrift, Namen von Mitschülern)'))
})

export function transkriptAnfrage(a: Abgabe): StructuredRequest {
  return {
    system:
      'Du überträgst handschriftliche oder gedruckte Schülerarbeiten wortgetreu in Text. Du verbesserst nichts: Rechtschreib-, Grammatik- und Zeichensetzungsfehler bleiben stehen, weil die Lehrkraft genau dazu eine Rückmeldung gibt.',
    user: [
      'Übertrage den Text auf den Bildern (in der Reihenfolge der Seiten). Durchgestrichenes weglassen, Einfügungen an ihrer Stelle einsetzen.',
      'Personennamen nennst du zusätzlich im Feld erkannteNamen; im Text lässt du sie stehen – die App ersetzt sie.'
    ].join('\n'),
    images: a.bilder,
    schemaName: 'rueckmeldung_transkript',
    schema: TRANSKRIPT
  }
}

/** Antwort der Übertragung → Text mit Kürzel statt Namen */
export function transkriptUebernehmen(a: Abgabe, daten: unknown): Abgabe {
  const d = (daten ?? {}) as { text?: unknown; unleserlich?: unknown; erkannteNamen?: unknown }
  const roh = String(d.text ?? '').trim()
  if (!roh) throw new Error('Auf den Bildern wurde kein Text erkannt.')
  const namen = (Array.isArray(d.erkannteNamen) ? d.erkannteNamen : []).map((n) => String(n ?? '').trim()).filter((n) => n.length > 1)
  // Alle erkannten Namen bekommen das Kürzel der Abgabe – die Arbeit gehört EINER Person; Namen Dritter werden ebenfalls unkenntlich
  const { text, zuordnung } = ersetzeNamen(roh, namen, a.pseudonyme ?? [])
  const hinweis = String(d.unleserlich ?? '').trim()
  return { ...a, text: hinweis ? `${text}\n\n[unleserlich: ${hinweis}]` : text, bilder: [], pseudonyme: zuordnung }
}

/**
 * Der Text einer Abgabe, wie er an die KI geht: ohne Namen (Praxislauf 28.09.2026 – eingetippte
 * und als Datei geladene Abgaben gingen bis dahin unverändert hinaus, nur übertragene Fotos
 * waren bereinigt). Der eingetragene Name der Person wird zu ihrem Kürzel, weitere erkannte Namen
 * (Kopfzeile, bekannte Vornamen) zu „S1-P1" usw. Die Zuordnung bleibt an der Abgabe auf diesem
 * Rechner und setzt die Namen im Bogen wieder ein; der Text selbst bleibt für die Lehrkraft, wie er war.
 */
export function ohneNamen(a: Abgabe): { text: string; pseudonyme: Zuordnung[] } {
  const eigener = a.name.trim()
  const bisher = a.pseudonyme ?? []
  const fremde = findeNamen(a.text)
    .map((f) => f.name)
    .filter((n) => n.length > 1 && n !== eigener && !eigener.split(/\s+/).includes(n) && !bisher.some((z) => z.name === n))
  let text = a.text
  if (eigener) text = ersetzeNamen(text, [eigener], [{ kuerzel: a.kuerzel, name: eigener }]).text
  const neu: Zuordnung[] = fremde.map((name, i) => ({ kuerzel: `${a.kuerzel}-P${bisher.length + i + 1}`, name }))
  const alle = [...bisher, ...neu]
  if (alle.length)
    text = ersetzeNamen(
      text,
      alle.map((z) => z.name),
      alle
    ).text
  return { text, pseudonyme: alle }
}

// ---------- Rückmeldebogen ----------

const EINSCHAETZUNGEN: Einschaetzung[] = ['sicher', 'teilweise', 'noch nicht']

const BOGEN = obj({
  staerken: arr(str('Was schon gelingt – konkret, mit Bezug auf eine Stelle der Arbeit, ein Satz')),
  schritte: arr(str('Nächster Schritt als Handlung („Achte beim nächsten Mal darauf, …"), ein Satz, mit Beispiel aus der Arbeit')),
  kriterien: arr(
    obj({
      kriterium: str('Kriterium aus der Aufgabe bzw. dem Schwerpunkt der Lehrkraft'),
      einschaetzung: enumOf(EINSCHAETZUNGEN),
      beleg: str('Kurzes Zitat oder Stelle aus der Arbeit, die die Einschätzung belegt')
    })
  ),
  schluss: str('Ein ermutigender, ehrlicher Schlusssatz – ohne Floskel')
})

export function bogenAnfrage(r: Rueckmeldung, a: Abgabe, system: string): StructuredRequest {
  const du = r.meta.anrede === 'du'
  return {
    system,
    user: [
      `Schreibe eine Rückmeldung zur Arbeit von ${a.kuerzel} (${r.meta.subjectLabel}, Klasse ${r.meta.grade}). Sprich die Person mit „${du ? 'du' : 'Sie'}" an.`,
      'REGELN:',
      '- KEINE Note, KEINE Punkte, KEINE Prozentwerte, keine Einstufung wie „gut" oder „ausreichend" – die Rückmeldung ist lernförderlich, nicht bewertend.',
      '- 2–4 Stärken und 2–3 nächste Schritte, jeweils konkret mit Bezug auf eine Stelle der Arbeit; die Schritte sind machbar und in der Reihenfolge ihrer Wichtigkeit.',
      '- Kriterien aus der Aufgabe (und dem Schwerpunkt der Lehrkraft) mit Einschätzung „sicher", „teilweise" oder „noch nicht" und einem Beleg aus der Arbeit.',
      '- Freundlich und ehrlich; keine Übertreibung, keine allgemeinen Floskeln.',
      '- Personen nur mit ihrem Kürzel nennen (S1, S2 …).',
      r.meta.schwerpunkt.trim() ? `SCHWERPUNKT DER LEHRKRAFT: ${r.meta.schwerpunkt.trim()}` : '',
      `AUFGABE${r.grundlage.titel ? ` (${r.grundlage.titel})` : ''}:`,
      r.grundlage.aufgaben,
      r.grundlage.erwartung ? `ERWARTUNGSHORIZONT:\n${r.grundlage.erwartung}` : '',
      `ARBEIT VON ${a.kuerzel}:`,
      a.text
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'rueckmeldung_bogen',
    schema: BOGEN
  }
}

/**
 * Entfernt, was nach Note oder Punkten aussieht – auch wenn die KI sich nicht daran hält.
 * Liefert die Zahl der entfernten Sätze.
 */
const NOTE =
  /\b(Note|Noten|Notenpunkte?|Zensur|Punkte?|Prozent)\b|\d+\s*(\/|von)\s*\d+|\d+\s*%|\b(befriedigend|ausreichend|mangelhaft|ungenügend)\b|\bNote\s*[1-6]|\b[1-6][+-](?!\w)/i

export function pruefeBogen(b: Bogen): Bogen {
  let entfernt = 0
  const sauber = (liste: string[]): string[] =>
    liste.filter((s) => {
      if (NOTE.test(s)) {
        entfernt++
        return false
      }
      return true
    })
  const kriterien = b.kriterien.filter((k) => {
    if (NOTE.test(k.kriterium) || NOTE.test(k.beleg ?? '')) {
      entfernt++
      return false
    }
    return true
  })
  const schluss = b.schluss && NOTE.test(b.schluss) ? (entfernt++, undefined) : b.schluss
  return { staerken: sauber(b.staerken), schritte: sauber(b.schritte), kriterien, ...(schluss ? { schluss } : {}), ...(entfernt ? { entfernt } : {}) }
}

export function bogenAus(daten: unknown): Bogen {
  const d = (daten ?? {}) as Record<string, unknown>
  const liste = (x: unknown): string[] => (Array.isArray(x) ? x.map((s) => String(s ?? '').trim()).filter(Boolean) : [])
  const kriterien = (Array.isArray(d.kriterien) ? d.kriterien : [])
    .map((k) => (k ?? {}) as Record<string, unknown>)
    .filter((k) => String(k.kriterium ?? '').trim())
    .map((k) => ({
      kriterium: String(k.kriterium).trim(),
      einschaetzung: (EINSCHAETZUNGEN.includes(k.einschaetzung as Einschaetzung) ? k.einschaetzung : 'teilweise') as Einschaetzung,
      ...(String(k.beleg ?? '').trim() ? { beleg: String(k.beleg).trim() } : {})
    }))
  const bogen = pruefeBogen({ staerken: liste(d.staerken), schritte: liste(d.schritte), kriterien, schluss: String(d.schluss ?? '').trim() || undefined })
  if (!bogen.staerken.length && !bogen.schritte.length) throw new Error('Die KI hat keine Rückmeldung geliefert.')
  return bogen
}

/** Beschreibung einer einzelnen Aufgabe (für „Rückmeldung zu dieser Aufgabe" aus anderen Programmen) */
export { describeBlock }
