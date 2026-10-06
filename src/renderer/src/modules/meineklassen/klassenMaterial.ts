/**
 * Material für eine Klasse aus „Meine Klassen" (06.10.2026): das Übungsblatt zu den Fehlerschwerpunkten des letzten Tests
 * entsteht im Hintergrund (wie die Platzhalter der Reihen: Gliederung → Ausformulieren → Bilder/Quellen), mit dem
 * KI-Zugang der Lehrkraft. Fertig liegt es in der Ablage „Arbeitsblatt" und erscheint in der Klasse unter „Passendes
 * Material" zum Ansehen und Freischalten – freigeschaltet wird erst nach kurzer Sichtung (abgestimmt).
 *
 * Welche Blätter fertig, aber noch nicht freigeschaltet sind, merkt sich dieses Gerät (localStorage); das Blatt selbst
 * liegt ohnehin in der Ablage.
 */
import { presetDesigns } from '@shared/design'
import { SCHULFORMEN } from '@shared/schulformen'
import { useEffect, useState } from 'react'
import { starteAuftrag } from '../../shared/auftraege'
import { useAppSettings } from '../../shared/settingsStore'
import { notifySuccess } from '../../shared/util'
import { finishWorksheet } from '../arbeitsblatt/generation/finish'
import { browserWorksheetImageDeps } from '../arbeitsblatt/generation/browserImages'
import { generateOutline, generateWorksheet } from '../arbeitsblatt/generation/generate'
import { browserSourceServices } from '../arbeitsblatt/generation/originalSources'
import { speichereNeuesArbeitsblatt } from '../arbeitsblatt/library'
import { defaultMeta } from '../arbeitsblatt/model/defaults'
import { SUBJECTS } from '../arbeitsblatt/model/subjects'
import type { Worksheet, WorksheetMeta } from '../arbeitsblatt/model/types'
import { profileFromMeta } from '../arbeitsblatt/render/SheetPages'

const SCHLUESSEL = (klasseId: string): string => `meineklassen-fertig:${klasseId}`
const EREIGNIS = 'meineklassen-fertig'

interface Gemerkt {
  docId: string
  titel: string
}
export interface FertigesBlatt extends Gemerkt {
  ws: Worksheet
  /** Nach dem Freischalten aus der Liste nehmen */
  erledigt: () => void
}

const lesen = (klasseId: string): Gemerkt[] => {
  try {
    return JSON.parse(localStorage.getItem(SCHLUESSEL(klasseId)) ?? '[]') as Gemerkt[]
  } catch {
    return []
  }
}
const schreiben = (klasseId: string, liste: Gemerkt[]): void => {
  try {
    localStorage.setItem(SCHLUESSEL(klasseId), JSON.stringify(liste))
  } catch {
    // ohne Browserspeicher: das Blatt liegt trotzdem in der Ablage „Arbeitsblatt"
  }
  window.dispatchEvent(new Event(EREIGNIS))
}

/** Fertige, noch nicht freigeschaltete Blätter einer Klasse (aktualisiert sich, sobald ein Auftrag fertig ist) */
export function useFertigeBlaetter(klasseId: string): FertigesBlatt[] {
  const [liste, setListe] = useState<FertigesBlatt[]>([])
  useEffect(() => {
    let aktiv = true
    const laden = (): void => {
      const gemerkt = lesen(klasseId)
      void Promise.all(
        gemerkt.map(async (g) => {
          try {
            const w = await window.api.sheets.get(g.docId)
            return { ...g, ws: w.payload as Worksheet }
          } catch {
            return null
          }
        })
      ).then((l) => {
        if (!aktiv) return
        setListe(
          l
            .filter((x): x is Gemerkt & { ws: Worksheet } => Boolean(x))
            .map((x) => ({
              ...x,
              erledigt: () =>
                schreiben(
                  klasseId,
                  lesen(klasseId).filter((y) => y.docId !== x.docId)
                )
            }))
        )
      })
    }
    laden()
    window.addEventListener(EREIGNIS, laden)
    return () => {
      aktiv = false
      window.removeEventListener(EREIGNIS, laden)
    }
  }, [klasseId])
  return liste
}

/** Jahrgang aus dem Namen der Lerngruppe („5b", „Q1 Englisch" → 11 als grobe Näherung) */
export function jahrgangAus(name: string): number {
  const m = /(\d{1,2})/.exec(name)
  if (m) return Math.min(13, Math.max(1, Number(m[1])))
  if (/\bq1\b/i.test(name)) return 12
  if (/\bq2\b/i.test(name)) return 13
  if (/\bef\b|\be\b/i.test(name)) return 11
  return 8
}

/** Blatt-Meta für die Klasse und die Fehlerschwerpunkte */
export function klassenBlattMeta(
  k: { name: string; fach: string; titel: string },
  v: { thema: string; schwerpunkte: string[]; testArt: string; titel: string }
): WorksheetMeta {
  const { settings } = useAppSettings.getState()
  const land = settings.defaults?.stateId ?? 'NI'
  const form = settings.defaults?.schoolTypeId ?? 'gymnasium'
  const schulform = SCHULFORMEN[land]?.find((f) => f.id === form)?.name ?? ''
  const fach = SUBJECTS.find((s) => s.label.toLowerCase() === k.fach.toLowerCase()) ?? SUBJECTS.find((s) => s.id === 'englisch') ?? SUBJECTS[0]
  return {
    ...defaultMeta(land, form, schulform),
    subjectId: fach.id,
    subjectLabel: fach.label,
    grade: jahrgangAus(k.name),
    title: `Übung: ${v.thema}`,
    topic: `Übungsblatt zu den Fehlerschwerpunkten aus dem ${v.testArt} „${v.thema}" (${k.titel})`,
    learningGoals: [
      'Gezielte Übung der Fehlerschwerpunkte aus dem letzten Test – mit kurzer Erklärung, gelösten Beispielen und gestuften Übungen:',
      ...v.schwerpunkte.map((s) => `- ${s}`)
    ].join('\n'),
    priorKnowledge: `Die Klasse hat den ${v.testArt} „${v.thema}" geschrieben; die Schwerpunkte zeigen, was noch nicht sitzt.`,
    pages: 1
  }
}

/** Übungsblatt im Hintergrund erzeugen; fertig → in der Klasse unter „Passendes Material" */
export function blattFuerKlasse(
  k: { id: string; name: string; fach: string; titel: string },
  v: { thema: string; schwerpunkte: string[]; testArt: string; titel: string; testId: string }
): void {
  const meta = klassenBlattMeta(k, v)
  void starteAuftrag({
    moduleId: 'meineklassen',
    docId: k.id,
    titel: meta.title,
    art: `Übungsblatt für ${k.titel}`,
    eingabe: meta,
    sperrt: false,
    schluessel: `meineklassen:${k.id}:${v.testId}`,
    fehlerTitel: 'Übungsblatt konnte nicht erstellt werden',
    arbeit: async (m, ctx) => {
      const profile = profileFromMeta(m)
      ctx.melde('Die KI plant das Übungsblatt …')
      const ws: Worksheet = { version: 1, meta: m, design: presetDesigns()[0], outline: null, sheets: [], sources: [], createdAt: new Date().toISOString() }
      ws.outline = await generateOutline(m, profile, [], ctx.ai)
      const result = await generateWorksheet(ws, profile, {
        ai: ctx.ai,
        review: true,
        combined: false,
        onProgress: (message, done, total) => ctx.melde(message, done, total, 'formulate')
      })
      await finishWorksheet(
        result,
        profile,
        { ai: ctx.ai, images: await browserWorksheetImageDeps({ ai: ctx.ai, bild: ctx.bild }), sources: browserSourceServices() },
        (message, done, total) => ctx.melde(message, done, total, 'finish')
      )
      return result
    },
    ablegen: async (ws) => {
      const { logoDataUrl, settings } = useAppSettings.getState()
      const docId = await speichereNeuesArbeitsblatt(ws, logoDataUrl ?? null, settings.schoolName ?? '')
      schreiben(k.id, [...lesen(k.id).filter((x) => x.docId !== docId), { docId, titel: ws.meta.title || meta.title }])
      notifySuccess(`Übungsblatt für ${k.titel} ist fertig – in „Meine Klassen" ansehen und freischalten.`)
    },
    abschluss: () => `Übungsblatt für ${k.titel} fertig`
  })
}
