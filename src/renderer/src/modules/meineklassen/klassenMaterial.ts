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
  const fach = blattFach(k.fach)
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

/** Fach des Arbeitsblatts aus dem Fachnamen (Englisch …), sonst Englisch */
const blattFach = (name: string): (typeof SUBJECTS)[number] =>
  SUBJECTS.find((s) => s.label.toLowerCase() === name.trim().toLowerCase()) ?? SUBJECTS.find((s) => s.id === 'englisch') ?? SUBJECTS[0]

/**
 * „Wackelige Wörter" als kurzes Arbeitsblatt (09.10.2026, Wunsch der Lehrkraft): höchstens zwei Seiten mit genau diesen
 * Wörtern – Zuordnen, Lückensätze (mit den Beispielsätzen) und Übersetzen im Zusammenhang; Fach = Sprache des Kurses,
 * Jahrgang der Klasse. Beim Freischalten geht das Fach mit (meta.subjectLabel) – so liegt es im passenden Fach-Ordner
 * der Lernenden unter „Materialien".
 */
export function vokabelBlattMeta(
  k: { name: string; fach: string; titel: string },
  v: { fach: string; woerter: { term: string; translation: string; example?: string }[] }
): WorksheetMeta {
  const { settings } = useAppSettings.getState()
  const land = settings.defaults?.stateId ?? 'NI'
  const form = settings.defaults?.schoolTypeId ?? 'gymnasium'
  const schulform = SCHULFORMEN[land]?.find((f) => f.id === form)?.name ?? ''
  const fach = blattFach(v.fach || k.fach)
  const liste = v.woerter.map((w) => `- ${w.term} – ${w.translation}${w.example ? ` (Beispiel: ${w.example})` : ''}`)
  return {
    ...defaultMeta(land, form, schulform),
    subjectId: fach.id,
    subjectLabel: fach.label,
    grade: jahrgangAus(k.name),
    title: 'Vokabelübung: wackelige Wörter',
    topic: `Kurze Vokabelübung mit ${v.woerter.length} Wörtern, die in der Klasse gerade wackeln (${k.titel})`,
    learningGoals: [
      `Kurzes Übungsblatt (höchstens zwei Seiten) mit GENAU diesen ${v.woerter.length} Wörtern – keine weiteren Vokabeln abfragen:`,
      ...liste,
      'Aufgaben, aufsteigend: 1. Zuordnen (Wort – Bedeutung), 2. Lückensätze mit den Beispielsätzen bzw. ähnlichen Sätzen (Wortspeicher mit genau diesen Wörtern),',
      '3. Übersetzen im Zusammenhang (kurze Sätze, in denen die Wörter vorkommen). Kurz und klar, ohne lange Einleitung, mit Lösungen.'
    ].join('\n'),
    priorKnowledge: 'Die Wörter wurden im Vokabeltraining der Klasse schon geübt, sitzen aber bei vielen noch nicht.',
    pages: 2
  }
}

/** Gemeinsamer Hintergrundauftrag: Blatt planen, ausformulieren, fertigstellen; fertig → „Passendes Material" */
function klassenBlattAuftrag(k: { id: string; titel: string }, meta: WorksheetMeta, schluessel: string, art: string): void {
  void starteAuftrag({
    moduleId: 'meineklassen',
    docId: k.id,
    titel: meta.title,
    art: `${art} für ${k.titel}`,
    eingabe: meta,
    sperrt: false,
    schluessel,
    fehlerTitel: `${art} konnte nicht erstellt werden`,
    arbeit: async (m, ctx) => {
      const profile = profileFromMeta(m)
      ctx.melde(`Die KI plant das ${art} …`)
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
      notifySuccess(`${art} für ${k.titel} ist fertig – in „Meine Klassen" ansehen und freischalten.`)
      // „Öffnen" im fertigen Auftrag: das Blatt im Editor (während er läuft: die Klasse, docId = Lerngruppe)
      return { moduleId: 'arbeitsblatt', docId }
    },
    abschluss: () => `${art} für ${k.titel} fertig`
  })
}

/** Übungsblatt im Hintergrund erzeugen; fertig → in der Klasse unter „Passendes Material" */
export function blattFuerKlasse(
  k: { id: string; name: string; fach: string; titel: string },
  v: { thema: string; schwerpunkte: string[]; testArt: string; titel: string; testId: string }
): void {
  klassenBlattAuftrag(k, klassenBlattMeta(k, v), `meineklassen:${k.id}:${v.testId}`, 'Übungsblatt')
}

/** Kurzes Vokabel-Arbeitsblatt zu den wackeligen Wörtern im Hintergrund erzeugen (09.10.2026) */
export function vokabelBlattFuerKlasse(
  k: { id: string; name: string; fach: string; titel: string },
  v: { fach: string; woerter: { term: string; translation: string; example?: string }[] }
): void {
  klassenBlattAuftrag(k, vokabelBlattMeta(k, v), `meineklassen:${k.id}:wackelig`, 'Vokabelblatt')
}
