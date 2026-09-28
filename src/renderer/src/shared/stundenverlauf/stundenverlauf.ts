/**
 * Stundenverlauf als Anlage zum Material (Großprogramm 0.4, F4).
 *
 * Eine tabellarische Verlaufsplanung, wie sie in Unterrichtsentwürfen üblich ist: Phase, Zeit,
 * geplantes Geschehen (Lehrkraft / Lernende), Sozialform, Medien und Material. Sie entsteht aus
 * dem fertigen Material (die KI sieht Aufgaben und Materialien) und ist frei bearbeitbar. Die
 * Minuten ergeben immer genau die Dauer der Stunde – die KI verrechnet sich gern; die App verteilt
 * danach mit `distribute` (dieselbe Rechnung wie Punkte und Minuten der Klassenarbeit).
 *
 * Nur für die Lehrkraft: Der Verlauf erscheint nie auf den Blättern der Lernenden.
 */
import type { StructuredRequest } from '@shared/types'
import { distribute } from '../../modules/klassenarbeit/model/types'
import { arr, int, obj, str } from '../aiSchema'
import { kiMetaTag, type KiHerkunft } from '@shared/kiKennzeichnung'

export const SOZIALFORMEN = ['EA', 'PA', 'GA', 'UG', 'LV', 'SV', 'Plenum'] as const

export interface VerlaufsPhase {
  id: string
  /** Einstieg, Erarbeitung, Sicherung, Transfer, Hausaufgabe … */
  phase: string
  minuten: number
  /** Geplantes Geschehen: Impulse der Lehrkraft, Tätigkeit der Lernenden, erwartete Beiträge */
  geschehen: string
  sozialform: string
  /** Medien und Material, mit Bezug auf das Blatt (M1, Aufgabe 2) */
  medien: string
}

export interface Stundenverlauf {
  /** Dauer der Stunde in Minuten (45, 90 oder frei) */
  dauer: number
  /** Stundenziel in einem Satz */
  ziel: string
  phasen: VerlaufsPhase[]
  /** Didaktischer Kommentar (Differenzierung, mögliche Stolpersteine) */
  hinweise?: string
}

const neueId = (): string => Math.random().toString(36).slice(2, 10)

export function leererVerlauf(dauer = 45): Stundenverlauf {
  const vorlage = [
    { phase: 'Einstieg', gewicht: 5, sozialform: 'UG' },
    { phase: 'Erarbeitung', gewicht: 25, sozialform: 'EA' },
    { phase: 'Sicherung', gewicht: 15, sozialform: 'UG' }
  ]
  const minuten = distribute(
    vorlage.map((v) => v.gewicht),
    dauer
  )
  return {
    dauer,
    ziel: '',
    phasen: vorlage.map((v, i) => ({ id: neueId(), phase: v.phase, minuten: minuten[i], geschehen: '', sozialform: v.sozialform, medien: '' }))
  }
}

export const summeMinuten = (v: Stundenverlauf): number => v.phasen.reduce((n, p) => n + (Number(p.minuten) || 0), 0)

/** Bringt die Minuten genau auf die Dauer (verhältnisgleich, jede Phase mindestens 1 Minute) */
export function minutenAngleichen(v: Stundenverlauf): Stundenverlauf {
  if (!v.phasen.length) return v
  const gewichte = v.phasen.map((p) => Math.max(1, Number(p.minuten) || 1))
  const neu = distribute(gewichte, v.dauer).map((m) => Math.max(1, m))
  // Mindestminuten können die Summe um wenige Minuten überschreiten – dann bei der längsten Phase abziehen
  let ueber = neu.reduce((n, m) => n + m, 0) - v.dauer
  while (ueber > 0) {
    const i = neu.indexOf(Math.max(...neu))
    if (neu[i] <= 1) break
    neu[i]--
    ueber--
  }
  return { ...v, phasen: v.phasen.map((p, i) => ({ ...p, minuten: neu[i] })) }
}

const SCHEMA = obj({
  ziel: str('Stundenziel in einem Satz aus Sicht der Lernenden („Die Lernenden können …")'),
  phasen: arr(
    obj({
      phase: str('Name der Phase: Einstieg, Erarbeitung, Sicherung, Transfer, Vertiefung, Hausaufgabe'),
      minuten: int('Minuten dieser Phase'),
      geschehen: str(
        'Geplantes Geschehen: Impuls/Arbeitsauftrag der Lehrkraft, Tätigkeit der Lernenden, erwartete Ergebnisse – knapp, Stichpunkte mit „·" getrennt'
      ),
      sozialform: str(`Eine von: ${SOZIALFORMEN.join(', ')}`),
      medien: str('Medien und Material mit Bezug auf das Blatt (z. B. „M1, Aufgabe 1–2, Tafel")')
    })
  ),
  hinweise: str('Kurzer didaktischer Kommentar: Differenzierung, mögliche Schwierigkeiten, Alternativen – höchstens drei Sätze')
})

/**
 * Anfrage an die KI. `material` ist die Beschreibung des Materials (Aufgaben, Texte), `system`
 * das Lerngruppen-Profil des Programms.
 */
export function verlaufsAnfrage(system: string, material: string, dauer: number, wunsch = ''): StructuredRequest {
  return {
    system,
    user: [
      `Plane den Verlauf einer Unterrichtsstunde von ${dauer} Minuten, in der das folgende Material eingesetzt wird.`,
      'REGELN:',
      '- Übliche Phasen: Einstieg (Motivation, Problemstellung), Erarbeitung (mit den Aufgaben des Materials), Sicherung (Ergebnisse zusammentragen), bei Bedarf Transfer oder Vertiefung und Hausaufgabe.',
      '- Jede Aufgabe und jedes Material des Blattes kommt in einer Phase vor; nenne sie mit ihrer Nummer (M1, Aufgabe 2).',
      '- Realistische Zeiten: Lesezeit der Texte, Bearbeitungszeit der Aufgaben, Zeit für Wechsel der Sozialform.',
      `- Die Minuten aller Phasen ergeben zusammen GENAU ${dauer}.`,
      '- Sozialformen abwechseln, wo es der Sache dient; keine Methode um ihrer selbst willen.',
      // Praxislauf 28.09.2026: Die KI schrieb ganze Aufgabentexte samt AFB-Begründung in die Spalte
      '- „geschehen" ist eine Planungsnotiz, kein Abschrieb: höchstens vier Stichpunkte je Phase, jeder unter 20 Wörtern. Aufgaben nur mit Nummer und Operator nennen („Aufgabe 2: Untersuchen"), NICHT ihren Wortlaut, keine AFB-Begründungen und keine Erwartungshorizonte abschreiben.',
      wunsch ? `WÜNSCHE DER LEHRKRAFT (umsetzen): ${wunsch}` : '',
      'MATERIAL:',
      material
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'stundenverlauf',
    schema: SCHEMA
  }
}

/** Antwort der KI → Verlauf mit genau passender Summe */
export function verlaufAus(daten: unknown, dauer: number): Stundenverlauf {
  const d = (daten ?? {}) as { ziel?: unknown; phasen?: unknown; hinweise?: unknown }
  const phasen = (Array.isArray(d.phasen) ? d.phasen : [])
    .map((p) => (p ?? {}) as Record<string, unknown>)
    .filter((p) => String(p.phase ?? '').trim())
    .map((p) => ({
      id: neueId(),
      phase: String(p.phase).trim(),
      minuten: Math.max(1, Math.round(Number(p.minuten) || 1)),
      geschehen: String(p.geschehen ?? '').trim(),
      sozialform: String(p.sozialform ?? '').trim(),
      medien: String(p.medien ?? '').trim()
    }))
  if (!phasen.length) throw new Error('Die KI hat keinen Verlauf geliefert.')
  return minutenAngleichen({
    dauer,
    ziel: String(d.ziel ?? '').trim(),
    phasen,
    ...(String(d.hinweise ?? '').trim() ? { hinweise: String(d.hinweise).trim() } : {})
  })
}

/** Druckfassung (HTML für PDF und Druck) */
export function verlaufHtml(v: Stundenverlauf, titel: string, untertitel: string, ki?: KiHerkunft): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const zeilen = v.phasen
    .map(
      (p) =>
        `<tr><td><b>${esc(p.phase)}</b></td><td class="z">${p.minuten}′</td><td>${esc(p.geschehen).replace(/ · /g, '<br>')}</td><td>${esc(p.sozialform)}</td><td>${esc(p.medien)}</td></tr>`
    )
    .join('')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Stundenverlauf – ${esc(titel)}</title>${kiMetaTag(ki)}<style>
@page { size: A4 landscape; margin: 14mm; }
body { font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; color: #000; margin: 0; }
h1 { font-size: 15pt; margin: 0 0 1mm; } .u { color: #555; margin: 0 0 4mm; }
table { width: 100%; border-collapse: collapse; } th, td { border: 0.3mm solid #888; padding: 1.5mm 2mm; vertical-align: top; text-align: left; }
th { background: #eee; } td.z { white-space: nowrap; } .h { margin-top: 4mm; }
</style></head><body><h1>Stundenverlauf – ${esc(titel)}</h1><p class="u">${esc(untertitel)} · ${v.dauer} Minuten</p>
${v.ziel ? `<p><b>Stundenziel:</b> ${esc(v.ziel)}</p>` : ''}
<table><thead><tr><th style="width:14%">Phase</th><th style="width:6%">Zeit</th><th>Geplantes Geschehen</th><th style="width:9%">Sozialform</th><th style="width:18%">Medien / Material</th></tr></thead><tbody>${zeilen}</tbody></table>
${v.hinweise ? `<p class="h"><b>Hinweise:</b> ${esc(v.hinweise)}</p>` : ''}</body></html>`
}
