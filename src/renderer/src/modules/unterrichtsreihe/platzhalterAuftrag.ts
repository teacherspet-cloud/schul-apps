/**
 * Platzhalter „Arbeitsblatt" einer Reihe im Hintergrund erzeugen (05.10.2026, abgestimmt: „Im Hintergrund
 * fertig"): volle Arbeitsblatt-Erzeugung (Gliederung → Ausformulieren → Quellen/Bilder), als NEUES Blatt
 * in der Ablage gespeichert und mit dem Schritt verknüpft.
 *
 * Ist die Reihe beim Ablegen im Editor offen, übernimmt der Editor die Änderung (`horcheReihe`) – sonst
 * wird die gespeicherte Reihe am Server ergänzt. So geht nichts verloren, wenn die Lehrkraft inzwischen
 * etwas anderes macht.
 */
import { leererInhalt, type Reihe, type Schritt } from '@shared/reihe'
import { SCHULFORMEN } from '@shared/schulformen'
import { starteAuftrag, useAuftraege } from '../../shared/auftraege'
import { useAppSettings } from '../../shared/settingsStore'
import { notifySuccess } from '../../shared/util'
import { defaultMeta } from '../arbeitsblatt/model/defaults'
import { subjectById } from '../arbeitsblatt/model/subjects'
import type { SourceMaterial, Worksheet, WorksheetMeta } from '../arbeitsblatt/model/types'
import { presetDesigns } from '@shared/design'
import { generateOutline, generateWorksheet } from '../arbeitsblatt/generation/generate'
import { finishWorksheet } from '../arbeitsblatt/generation/finish'
import { browserWorksheetImageDeps } from '../arbeitsblatt/generation/browserImages'
import { browserSourceServices } from '../arbeitsblatt/generation/originalSources'
import { profileFromMeta } from '../arbeitsblatt/render/SheetPages'
import { speichereNeuesArbeitsblatt } from '../arbeitsblatt/library'
import { holen, senden } from '../onlinetest/serverApi'
import { blattAlsSchrittGemessen } from './schrittAusBlatt'

type Aenderung = (schrittId: string, patch: Partial<Schritt>) => void
const horcher = new Map<string, Aenderung>()

/** Der offene Editor meldet sich für seine Reihe an (Rückgabe: abmelden) */
export function horcheReihe(reiheId: string, fn: Aenderung): () => void {
  horcher.set(reiheId, fn)
  return () => {
    if (horcher.get(reiheId) === fn) horcher.delete(reiheId)
  }
}

/**
 * Änderung an einem Schritt ablegen (auch für „Test hier erstellen", 06.10.2026): im offenen Editor, sonst in der
 * gespeicherten Reihe am Server.
 */
export async function schrittAendernUeberall(reiheId: string, schrittId: string, patch: Partial<Schritt>): Promise<void> {
  const offen = horcher.get(reiheId)
  if (offen) return offen(schrittId, patch)
  const { reihe } = await holen<{ reihe: Reihe }>(`/server/reihen/${reiheId}`)
  await senden('/server/reihen/speichern', { reihe: { ...reihe, schritte: reihe.schritte.map((x) => (x.id === schrittId ? { ...x, ...patch } : x)) } })
}

export const platzhalterSchluessel = (reiheId: string, schrittId: string): string => `reihe:${reiheId}:${schrittId}`

/** Läuft für diesen Schritt gerade eine Erzeugung? */
export const useErzeugtGerade = (reiheId: string | undefined, schrittId: string): boolean =>
  useAuftraege((st) => Boolean(reiheId) && st.auftraege.some((a) => a.schluessel === platzhalterSchluessel(reiheId!, schrittId) && a.status === 'laufend'))

/** Meta des Arbeitsblatts aus Reihe und Platzhalter */
export function blattMeta(r: Reihe, s: Schritt): WorksheetMeta {
  const schulform = SCHULFORMEN[r.stateId]?.find((f) => f.id === r.schoolTypeId)?.name ?? ''
  const fach = subjectById(r.fachId)
  const idx = r.schritte.findIndex((x) => x.id === s.id)
  const davor = r.schritte
    .slice(0, Math.max(0, idx))
    .map((x) => x.titel)
    .filter(Boolean)
    .slice(-6)
  return {
    ...defaultMeta(r.stateId, r.schoolTypeId, schulform),
    subjectId: fach.id,
    subjectLabel: fach.label,
    grade: r.grade,
    title: s.titel,
    topic: `${s.titel}${r.oberthema ? ` (Reihe „${r.titel}", Oberthema: ${r.oberthema})` : ''}`,
    learningGoals: [s.platzhalter?.beschreibung ?? '', ...s.lernziele.map((l) => `- ${l.text}`)].filter(Boolean).join('\n'),
    priorKnowledge: davor.length ? `Vorher in der Reihe: ${davor.join('; ')}` : '',
    // Umfang nach geplanter Zeit: bis 25 Minuten eine Seite
    pages: (s.minuten ?? 30) <= 25 ? 1 : 2
  }
}

/**
 * Reihe aus Schulbuchseiten (06.10.2026): Was die KI zu den Buchabschnitten wissen muss (verweisen/übernehmen) als
 * Textquelle; ausdrücklich gewählte Bildausschnitte als eingebettete Bilder mit Quellenangabe im Dateinamen.
 * Ganze Seiten kommen nie aufs Blatt.
 */
export function buchQuellen(s: Schritt): SourceMaterial[] {
  const p = s.platzhalter
  if (!p?.buch) return []
  const leer = { pageCount: 0, pagesRead: [] as number[], useAsBasis: true }
  return [
    {
      id: `buch-${s.id}`,
      fileName: 'Schulbuch (Verweise und Übernahmen)',
      kind: 'text',
      text: p.buch,
      format: 'plain',
      pageImages: [],
      embedImage: false,
      ...leer
    },
    ...(p.uebernahme ?? [])
      .filter((u) => u.bild)
      .map(
        (u, i): SourceMaterial => ({
          id: `buchbild-${s.id}-${i}`,
          fileName: `${u.kennung} – Quelle: ${u.quelle}`,
          kind: 'image',
          text: `Bildausschnitt ${u.kennung} aus dem Schulbuch. Quelle: ${u.quelle}`,
          format: 'plain',
          pageImages: [u.bild!],
          embedImage: true,
          ...leer
        })
      )
  ]
}

/** Erzeugung anstoßen – die Reihe muss gespeichert sein (Kennung) */
export function erzeugeBlattFuerPlatzhalter(r: Reihe, s: Schritt): void {
  if (!r.id) throw new Error('Bitte die Reihe zuerst speichern.')
  const reiheId = r.id
  const meta = blattMeta(r, s)
  void starteAuftrag({
    moduleId: 'unterrichtsreihe',
    docId: reiheId,
    titel: s.titel || 'Arbeitsblatt',
    art: 'Arbeitsblatt für die Reihe',
    eingabe: meta,
    sperrt: false,
    schluessel: platzhalterSchluessel(reiheId, s.id),
    fehlerTitel: 'Arbeitsblatt für die Reihe konnte nicht erstellt werden',
    arbeit: async (m, k) => {
      const profile = profileFromMeta(m)
      k.melde('Die KI plant das Arbeitsblatt …')
      const quellen = buchQuellen(s)
      const ws: Worksheet = {
        version: 1,
        meta: m,
        design: presetDesigns()[0],
        outline: null,
        sheets: [],
        sources: quellen,
        createdAt: new Date().toISOString()
      }
      ws.outline = await generateOutline(m, profile, quellen, k.ai)
      const result = await generateWorksheet(ws, profile, {
        ai: k.ai,
        review: true,
        combined: false,
        onProgress: (message, done, total) => k.melde(message, done, total, 'formulate')
      })
      await finishWorksheet(
        result,
        profile,
        { ai: k.ai, images: await browserWorksheetImageDeps({ ai: k.ai, bild: k.bild }), sources: browserSourceServices() },
        (message, done, total) => k.melde(message, done, total, 'finish')
      )
      return result
    },
    ablegen: async (ws) => {
      const { logoDataUrl, settings } = useAppSettings.getState()
      const id = await speichereNeuesArbeitsblatt(ws, logoDataUrl ?? null, settings.schoolName ?? '')
      const b = await blattAlsSchrittGemessen(id, ws)
      const leer = leererInhalt('arbeitsblatt') as Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>
      const patch: Partial<Schritt> = {
        inhalt: { ...leer, ...(s.inhalt.art === 'arbeitsblatt' ? s.inhalt : {}), ...b.inhalt },
        platzhalter: undefined,
        ...(s.lernziele.length ? {} : { lernziele: b.lernziele })
      }
      const offen = horcher.get(reiheId)
      if (offen) offen(s.id, patch)
      else {
        // Editor zu: gespeicherte Reihe ergänzen
        const { reihe } = await holen<{ reihe: Reihe }>(`/server/reihen/${reiheId}`)
        await senden('/server/reihen/speichern', { reihe: { ...reihe, schritte: reihe.schritte.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) } })
      }
      notifySuccess(`Arbeitsblatt „${b.titel}" erstellt und mit dem Schritt verknüpft.`)
    },
    abschluss: () => 'Arbeitsblatt erstellt und in der Reihe verknüpft'
  })
}
