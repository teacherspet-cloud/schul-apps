/**
 * Lernziele aus der fertigen Gliederung (27.09.2026).
 *
 * Befund der Lehrkraft: Die Lernziele waren „sehr oft zu gleich" – dieselben Ich-kann-Sätze
 * auf Blatt um Blatt zum selben Thema. Grund: Sie entstanden im Gliederungsauftrag NEBENBEI,
 * bevor die Aufgaben feststanden; bei gleichem Thema und gleichem Auftrag schreibt ein
 * Sprachmodell dann fast wortgleich dieselben Formeln. Auf frühere Blätter greift die App dabei
 * nicht zurück – die Gleichförmigkeit kam aus dem Muster, nicht aus einem Gedächtnis.
 *
 * Deshalb jetzt eine EIGENE Anfrage nach der Gliederung: Die Lernziele werden aus genau den
 * geplanten Bausteinen abgeleitet – Material, Operatoren, Anforderungsbereiche dieses Blattes.
 * Zwei Blätter mit verschiedenen Aufgaben bekommen so verschiedene Ziele, und jedes Ziel sagt,
 * was auf diesem Blatt wirklich geübt wird. Vorgaben der Lehrkraft (meta.learningGoals) sind
 * Richtung, nicht Wortlaut. Misslingt die Anfrage, bleiben die Ziele aus der Gliederung.
 */
import { arr, obj, str } from '../../../shared/aiSchema'
import type { AiCall } from '../../../shared/imageChoice'
import type { Outline, WorksheetMeta } from '../model/types'

const SCHEMA = obj({ learningGoals: arr(str('Ich-kann-Satz, höchstens 22 Wörter')) })

const KOMPETENZFORMELN = /^ich kann (das thema|mich mit|die inhalte)/i

/** Ein Ziel je Zeile, ohne Aufzählungszeichen, ohne Dubletten; höchstens drei */
export function bereinigeLernziele(roh: unknown, hoechstens = 3): string[] {
  if (!Array.isArray(roh)) return []
  const gesehen = new Set<string>()
  const out: string[] = []
  for (const z of roh) {
    const s = String(z ?? '')
      .replace(/^\s*[-•*\d.)]+\s*/, '')
      .trim()
    if (!s || KOMPETENZFORMELN.test(s)) continue
    const k = s.toLocaleLowerCase('de')
    if (gesehen.has(k)) continue
    gesehen.add(k)
    out.push(s)
    if (out.length >= hoechstens) break
  }
  return out
}

/** Lernziele neu aus der Gliederung – die Ziele der Gliederung bleiben der Rückfall */
export async function lernzieleFormulieren(meta: WorksheetMeta, outline: Outline, ai: AiCall): Promise<string[]> {
  const bausteine = outline.items
    .filter((it) => it.type !== 'learningGoals' && it.type !== 'selfCheck')
    .map((it, i) => `${i + 1}. ${it.type}${it.operator ? ` – ${it.operator}` : ''}${it.afb ? ` (AFB ${it.afb})` : ''}: ${it.purpose}`)
  if (!bausteine.length) return outline.learningGoals
  try {
    const data = await ai<{ learningGoals: string[] }>({
      system: [
        `Du formulierst die Lernziele eines Arbeitsblatts (${meta.subjectLabel}, Klasse ${meta.grade}, ${meta.schoolTypeName}) – abgeleitet aus GENAU den geplanten Bausteinen.`,
        'REGELN:',
        '- 1 bis 3 Ich-kann-Sätze, jeder höchstens 22 Wörter, in der Sprache des Blattes.',
        '- Jeder Satz nennt den konkreten Gegenstand DIESES Blattes (das Material, die Quelle, den Sachverhalt), den Operator der Aufgabe und das Ergebnis („Ich kann anhand der Rede Wilhelms II. erklären, wie …").',
        '- Verschiedene Kompetenzbereiche: kein Satz wiederholt einen anderen mit anderen Worten; kein Satz wiederholt nur das Thema.',
        '- KEINE allgemeinen Kompetenzformeln („Ich kann Quellen analysieren", „Ich kann mich mit dem Thema auseinandersetzen") und keine Lehrplanzitate.',
        '- Nur, was die Bausteine wirklich verlangen – kein Ziel ohne passende Aufgabe.'
      ].join('\n'),
      user: [
        `Thema: ${meta.topic}`,
        outline.title ? `Titel des Blattes: ${outline.title}` : '',
        meta.learningGoals?.trim() ? `Richtung der Lehrkraft (nicht wörtlich übernehmen): ${meta.learningGoals.trim()}` : '',
        'Geplante Bausteine:',
        ...bausteine
      ]
        .filter(Boolean)
        .join('\n'),
      schemaName: 'lernziele',
      schema: SCHEMA
    })
    const ziele = bereinigeLernziele(data?.learningGoals)
    return ziele.length ? ziele : outline.learningGoals
  } catch {
    return outline.learningGoals
  }
}
