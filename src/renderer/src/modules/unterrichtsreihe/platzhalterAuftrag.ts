/**
 * Platzhalter „Arbeitsblatt" einer Reihe im Hintergrund erzeugen (05.10.2026, abgestimmt: „Im Hintergrund
 * fertig"): volle Arbeitsblatt-Erzeugung (Gliederung → Ausformulieren → Quellen/Bilder), als NEUES Blatt
 * in der Ablage gespeichert und mit dem Schritt verknüpft.
 *
 * Ist die Reihe beim Ablegen im Editor offen, übernimmt der Editor die Änderung (`horcheReihe`) – sonst
 * wird die gespeicherte Reihe am Server ergänzt. So geht nichts verloren, wenn die Lehrkraft inzwischen
 * etwas anderes macht.
 *
 * Seit 08.10.2026 (Plan „Unterrichtsreihe: Übersicht, KI-Status …", Abschnitte A und D):
 * - ALLE Schrittarten entstehen als Auftrag (`erzeugeFuerPlatzhalter`) – auch die kurzen (Lernkarten, Diagnose …),
 *   die vorher als direkter KI-Aufruf ohne „wartet", Restzeit und Abbrechen liefen und verloren gingen, wenn der
 *   Editor schloss. Die Schrittkarte zeigt den Stand (SchrittStatus.tsx);
 * - die Verknüpfung wird sofort gespeichert, auch bei offenem Editor (der Editor meldet dafür sein Speichern an);
 * - das Blatt heißt „<Reihe> – <Schritt>" und liegt im Themenbereich des Oberthemas;
 * - KI-Inhalte tragen die Marke „KI-Entwurf" (`Schritt.kiEntwurf`), bis die Lehrkraft sie öffnet oder bestätigt.
 */
import {
  SCHRITT_ARTEN,
  alsBlattSchritt,
  artVon,
  blattZweckFuer,
  leererInhalt,
  materialName,
  type BlattZweck,
  type Reihe,
  type Schritt
} from '@shared/reihe'
import { SCHULFORMEN } from '@shared/schulformen'
import { brichAb, laeuft, starteAuftrag, useAuftraege, type Auftrag } from '../../shared/auftraege'
import { useAppSettings } from '../../shared/settingsStore'
import { notifySuccess } from '../../shared/util'
import { fachIdVon } from '../../shared/fachfarben'
import { bereichAnlegen, ladeThemen, neuImBereich } from '../../shared/themenbereiche'
import { direktErzeugbar, erzeugeSchrittInhalt } from './reihePlanungKi'
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
import { blattZiele, grundlageEingabe, kcAuszugFuer } from './grundlage'

type Aenderung = (schrittId: string, patch: Partial<Schritt>) => void
/** Speichert den Stand des offenen Editors (mit allen übernommenen Änderungen) */
type Speichern = () => Promise<unknown>
const horcher = new Map<string, { fn: Aenderung; speichern?: Speichern }>()

/**
 * Der offene Editor meldet sich für seine Reihe an (Rückgabe: abmelden). `speichern` (08.10.2026): Danach wird die
 * Änderung gleich gespeichert – sonst ginge eine Verknüpfung mit „nicht speichern" verloren. `fn` muss den Stand,
 * den `speichern` sichert, sofort ändern (nicht erst beim nächsten Zeichnen).
 */
export function horcheReihe(reiheId: string, fn: Aenderung, speichern?: Speichern): () => void {
  const eintrag = { fn, speichern }
  horcher.set(reiheId, eintrag)
  return () => {
    if (horcher.get(reiheId) === eintrag) horcher.delete(reiheId)
  }
}

/** Ist die Reihe gerade im Editor offen? */
export const reiheOffen = (reiheId: string): boolean => horcher.has(reiheId)

/*
 * Nacheinander je Reihe: Werden mehrere Platzhalter kurz hintereinander fertig („Alle Platzhalter erstellen"), lädt
 * sonst jeder die gespeicherte Reihe, ergänzt seinen Schritt und speichert – und der Letzte überschreibt die anderen.
 */
const kette = new Map<string, Promise<unknown>>()
function nacheinander<T>(reiheId: string, arbeit: () => Promise<T>): Promise<T> {
  const vorher = kette.get(reiheId) ?? Promise.resolve()
  const lauf = vorher.catch(() => undefined).then(arbeit)
  const ende = lauf.catch(() => undefined)
  kette.set(reiheId, ende)
  void ende.then(() => {
    if (kette.get(reiheId) === ende) kette.delete(reiheId)
  })
  return lauf
}

/**
 * Änderung an einem Schritt ablegen (auch für „Test hier erstellen", 06.10.2026): im offenen Editor (und dort
 * gleich gespeichert), sonst in der gespeicherten Reihe am Server.
 */
export function schrittAendernUeberall(reiheId: string, schrittId: string, patch: Partial<Schritt>): Promise<void> {
  return nacheinander(reiheId, async () => {
    const offen = horcher.get(reiheId)
    if (offen) {
      offen.fn(schrittId, patch)
      await offen.speichern?.()
      return
    }
    const { reihe } = await holen<{ reihe: Reihe }>(`/server/reihen/${reiheId}`)
    // `auftrag`: frisch geladen und nur dieser Schritt geändert – ohne Prüfung auf einen neueren Stand (reiheSpeichern.ts)
    await senden('/server/reihen/speichern', {
      reihe: { ...reihe, schritte: reihe.schritte.map((x) => (x.id === schrittId ? { ...x, ...patch } : x)) },
      auftrag: true
    })
  })
}

export const platzhalterSchluessel = (reiheId: string, schrittId: string): string => `reihe:${reiheId}:${schrittId}`

/** Läuft (oder wartet) für diesen Schritt gerade eine Erzeugung? */
export const useErzeugtGerade = (reiheId: string | undefined, schrittId: string): boolean =>
  useAuftraege((st) => Boolean(reiheId) && st.auftraege.some((a) => a.schluessel === platzhalterSchluessel(reiheId!, schrittId) && laeuft(a)))

/** Der jüngste Auftrag dieses Schritts (laufend oder beendet, solange er in der Leiste steht) */
export const useSchrittAuftrag = (reiheId: string | undefined, schrittId: string): Auftrag | undefined =>
  useAuftraege((st) => {
    if (!reiheId) return undefined
    const k = platzhalterSchluessel(reiheId, schrittId)
    for (let i = st.auftraege.length - 1; i >= 0; i--) if (st.auftraege[i].schluessel === k) return st.auftraege[i]
    return undefined
  })

/** Laufende/wartende Aufträge der Platzhalter einer Reihe */
export const useLaufendePlatzhalter = (reiheId: string | undefined): number =>
  useAuftraege((st) => (reiheId ? st.auftraege.filter((a) => laeuft(a) && a.schluessel?.startsWith(`reihe:${reiheId}:`)).length : 0))

/** Alle laufenden und wartenden Platzhalter-Aufträge der Reihe abbrechen */
export function brichPlatzhalterAb(reiheId: string): void {
  for (const a of useAuftraege.getState().auftraege) if (laeuft(a) && a.schluessel?.startsWith(`reihe:${reiheId}:`)) brichAb(a.id)
}

/**
 * Auftragsart je Schrittart – unter ihr lernt die App die Dauer (shared/restzeit.ts). Entsteht der Schritt als Arbeitsblatt
 * (digitale Reihe, Plan G.2), dauert er wie ein Arbeitsblatt.
 */
export const auftragsArtFuer = (s: Pick<Schritt, 'inhalt' | 'titel' | 'platzhalter' | 'kiVorgabe'>, r?: Pick<Reihe, 'art'>): string =>
  s.inhalt.art === 'arbeitsblatt' || (r && blattZweckFuer(r, s))
    ? 'Arbeitsblatt für die Reihe'
    : `${SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)?.label ?? 'Schritt'} für die Reihe`

/** Kann die KI diesen Platzhalter füllen? (Tests entstehen im Test-Programm) */
export const platzhalterErzeugbar = (s: Schritt): boolean =>
  Boolean(s.platzhalter) && !s.test && (s.inhalt.art === 'arbeitsblatt' || direktErzeugbar(s.inhalt.art))

/** Platzhalter, die „Alle Platzhalter erstellen" anstoßen würde – ohne die, die schon laufen */
export function offenePlatzhalter(r: Reihe, laufend: (schrittId: string) => boolean = () => false): Schritt[] {
  return r.schritte.filter((s) => platzhalterErzeugbar(s) && !laufend(s.id))
}

/** Läuft für diesen Schritt (außerhalb von React) schon ein Auftrag? */
export const erzeugtGerade = (reiheId: string, schrittId: string): boolean =>
  useAuftraege.getState().auftraege.some((a) => a.schluessel === platzhalterSchluessel(reiheId, schrittId) && laeuft(a))

/**
 * Themenbereich des Oberthemas (08.10.2026): Das Blatt soll in „Meine Arbeitsblätter" beim Oberthema der Reihe liegen.
 * Gibt es den Bereich im Fach noch nicht, wird er angelegt. Scheitert das, bleibt das Blatt „ohne Themenbereich".
 */
async function inThemenbereich(r: Reihe, docId: string): Promise<void> {
  const name = r.oberthema?.trim()
  if (!name) return
  try {
    const daten = await ladeThemen()
    const fachId = fachIdVon(r.fachId) ?? fachIdVon(r.fachLabel) ?? r.fachId
    const klein = name.toLocaleLowerCase('de')
    const vorhanden = daten.bereiche.find(
      (b) => b.fachId === fachId && (b.name.toLocaleLowerCase('de') === klein || b.wortlaut?.toLocaleLowerCase('de') === klein)
    )
    const bereich = vorhanden ?? (await bereichAnlegen(fachId, name.slice(0, 120)))
    if (bereich) await neuImBereich('arbeitsblatt', docId, bereich)
  } catch (e) {
    console.warn('Themenbereich für das Arbeitsblatt der Reihe nicht gesetzt', e)
  }
}

/**
 * Vorgaben für ein Blatt, das Lernende ganz selbstständig am Gerät bearbeiten (08.10.2026, Plan G.2 und G.6), und für die
 * Rolle des Schritts, aus dem es entsteht. Gehen mit den Lernzielen an die KI (Richtung der Lehrkraft).
 */
export function blattRollenVorgaben(r: Pick<Reihe, 'art'>, s: Pick<Schritt, 'inhalt'>, zweck: BlattZweck | null): string[] {
  const selbst = artVon(r) === 'digital' || zweck !== null
  const zeilen: string[] = []
  if (selbst)
    zeilen.push(
      'SELBSTSTÄNDIG AM GERÄT: Die Lernenden arbeiten ohne Lehrkraft (PC, Tablet oder Handy). Beginne mit einem kurzen Merkkasten bzw. Infokasten: Erklärung in einfachen Worten und ein ausgearbeitetes Beispiel. Klare Arbeitsanweisungen mit Operatoren; zu jeder anspruchsvollen Aufgabe Hilfekarten (Tipp, Satzanfänge oder Wortspeicher).'
    )
  const i = s.inhalt
  if (zweck === 'einfuehrung')
    zeilen.push('EINFÜHRUNG: Zuerst das Neue erklären (Infotext/Merkkasten mit Beispiel), dann gestufte Übungen vom Einfachen zum Schweren, zuletzt eine kleine Anwendung.')
  if (zweck === 'abschluss')
    zeilen.push(
      [
        'ABSCHLUSSPRODUKT: Eine komplexe Anwendungs- bzw. Produktaufgabe, die die Lernziele der Reihe zusammenführt, mit Planungshilfe und Checkliste für die Lernenden.',
        i.art === 'abschluss' && i.anweisung.trim() ? `Auftrag: ${i.anweisung.trim()}` : '',
        i.art === 'abschluss' && i.raster.length
          ? `Bewertungsraster (im Erwartungshorizont je Kriterium ausweisen, als Checkliste auch für die Lernenden): ${i.raster.join('; ')}`
          : 'Lege ein kurzes Bewertungsraster mit 3–5 Kriterien an (Erwartungshorizont, als Checkliste auch für die Lernenden).'
      ]
        .filter(Boolean)
        .join(' ')
    )
  if (zweck === 'reflexion')
    zeilen.push(
      `SELBSTEINSCHÄTZUNG: Reflexionsaufgaben zu den Lernzielen (Was kann ich schon? Wo bin ich unsicher? Ein Beispiel aus meiner eigenen Arbeit), dazu je Lernziel eine kurze Übung zum Selbstüberprüfen mit Lösung. Keine Note, keine Punkte.${i.art === 'reflexion' && i.frage.trim() ? ` Leitfrage fürs Lerntagebuch: ${i.frage.trim()}` : ''}`
    )
  return zeilen
}

/** Meta des Arbeitsblatts aus Reihe und Platzhalter (`zweck`: Rolle, wenn der Schritt als Blatt entsteht – Plan G.2) */
export function blattMeta(r: Reihe, s: Schritt, zweck: BlattZweck | null = blattZweckFuer(r, s)): WorksheetMeta {
  const schulform = SCHULFORMEN[r.stateId]?.find((f) => f.id === r.schoolTypeId)?.name ?? ''
  const fach = subjectById(r.fachId)
  // Eingaben vereinheitlicht (08.10.2026, grundlage.ts): Lernziele der Reihe, Kerncurriculum, Minuten, didaktische
  // Funktion, Anspruch – ohne die vor dem Erstellen abgewählten Chips
  const g = grundlageEingabe(r, s, kcAuszugFuer(r))
  const basis = defaultMeta(r.stateId, r.schoolTypeId, schulform)
  // Niveau der Reihe bzw. des Schritts (08.10.2026, grundlage.ts `schrittNiveau`): Anspruch und Sprache getrennt
  const stufe = g.niveau || g.sprache ? { anspruch: g.niveau ?? 'mittel', sprache: g.sprache ?? g.niveau ?? 'mittel' } : undefined
  const rolle = blattRollenVorgaben(r, s, zweck)
  const selbst = artVon(r) === 'digital' || zweck !== null
  return {
    ...basis,
    subjectId: fach.id,
    subjectLabel: fach.label,
    grade: r.grade,
    title: s.titel,
    topic: `${s.titel}${r.oberthema ? ` (Reihe „${r.titel}", Oberthema: ${r.oberthema})` : ''}`,
    learningGoals: [blattZiele(s.platzhalter?.beschreibung ?? '', g), ...rolle].filter(Boolean).join('\n'),
    priorKnowledge: g.davor.length ? `Vorher in der Reihe: ${g.davor.join('; ')}` : '',
    ...(g.minuten ? { minutes: g.minuten } : {}),
    ...(g.stufen
      ? { differentiation: { ...basis.differentiation, levels: g.stufen, mode: 'separate' as const } }
      : stufe
      ? { differentiation: { ...basis.differentiation, schwierigkeit: stufe } }
      : {}),
    // Umfang nach geplanter Zeit: bis 25 Minuten eine Seite
    pages: (s.minuten ?? 30) <= 25 ? 1 : 2,
    // Korrekturrand an allen Schreiblinien (08.10.2026): Blätter der Reihe bekommen KI-Feedback am Rand
    correctionMargin: true,
    // Selbstständig am Gerät (Plan G.6): Hilfekarten, Lernhilfen und Lösungen immer, Erklärung mit Beispiel vorn
    ...(selbst ? { helpCards: true, lernhilfen: true, answerKey: true } : {}),
    ...(zweck === 'einfuehrung' ? { sheetType: 'erarbeitung' as const } : zweck === 'reflexion' ? { sheetType: 'wiederholung' as const } : {})
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

/**
 * Erzeugung anstoßen – die Reihe muss gespeichert sein (Kennung). `zweck` (Plan G.2): Der Schritt ist eine Zwischenaufgabe,
 * ein Abschlussprodukt oder eine Selbsteinschätzung und wird zum vollwertigen Arbeitsblatt in dieser Rolle.
 */
export function erzeugeBlattFuerPlatzhalter(r: Reihe, s: Schritt, zweck: BlattZweck | null = null): void {
  if (!r.id) throw new Error('Bitte die Reihe zuerst speichern.')
  const reiheId = r.id
  const meta = blattMeta(r, s, zweck)
  // Name in der Bibliothek und Themenbereich (08.10.2026): „<Reihe> – <Schritt>" beim Oberthema
  const name = materialName(r.titel, s.titel)
  void starteAuftrag({
    moduleId: 'unterrichtsreihe',
    docId: reiheId,
    titel: s.titel || 'Arbeitsblatt',
    art: auftragsArtFuer(s, r),
    eingabe: meta,
    sperrt: false,
    schluessel: platzhalterSchluessel(reiheId, s.id),
    istOffen: () => reiheOffen(reiheId),
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
      const id = await speichereNeuesArbeitsblatt(ws, logoDataUrl ?? null, settings.schoolName ?? '', name)
      await inThemenbereich(r, id)
      const b = await blattAlsSchrittGemessen(id, ws)
      const leer = leererInhalt('arbeitsblatt') as Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>
      // Als Blatt entstandene Zwischenaufgabe/Abschluss/Reflexion: Art „arbeitsblatt", Rolle und Erfolg dazu (Plan G.2, G.5)
      // Für die Reihe entstanden (10.10.2026): in den Bibliotheken ausgeblendet (shared/reiheMaterial.ts)
      const erzeugt = { ...b.inhalt, erzeugt: true }
      const umgewandelt = zweck ? alsBlattSchritt(s.inhalt, zweck, erzeugt, artVon(r)) : null
      const patch: Partial<Schritt> = {
        ...(umgewandelt ?? { inhalt: { ...leer, ...(s.inhalt.art === 'arbeitsblatt' ? s.inhalt : {}), ...erzeugt } }),
        platzhalter: undefined,
        kiEntwurf: true,
        ...(s.lernziele.length ? {} : { lernziele: b.lernziele })
      }
      // „Schrittweise freischalten" schlägt die KI beim Gliedern vor (08.10.2026) – mit Grund, im Schritt änderbar
      const o = ws.outline
      if (patch.inhalt?.art === 'arbeitsblatt' && typeof o?.schrittweise === 'boolean')
        patch.inhalt = { ...patch.inhalt, schrittweise: o.schrittweise, ...(o.schrittweiseGrund ? { schrittweiseGrund: o.schrittweiseGrund } : {}) }
      // Im offenen Editor übernommen und gleich gespeichert, sonst in der gespeicherten Reihe ergänzt
      await schrittAendernUeberall(reiheId, s.id, patch)
      notifySuccess(`Arbeitsblatt „${name}" erstellt, mit dem Schritt verknüpft und unter „Meine Arbeitsblätter" abgelegt.`)
      // „Öffnen" in der Auftragsleiste führt zum Blatt
      return { moduleId: 'arbeitsblatt', docId: id }
    },
    abschluss: () => 'Arbeitsblatt erstellt und in der Reihe verknüpft'
  })
}

/**
 * Inhalt eines Platzhalters, der kein Arbeitsblatt ist (Aufgabe, Lernkarten, Diagnose, Reflexion, Hefter, Abschluss,
 * Sprechen, Präsenz), als Auftrag (08.10.2026): wartet sichtbar auf einen Platz, zeigt Restzeit, lässt sich abbrechen
 * und landet in der Reihe, auch wenn der Editor inzwischen zu ist.
 */
export function erzeugeSchrittFuerPlatzhalter(r: Reihe, s: Schritt): void {
  if (!r.id) throw new Error('Bitte die Reihe zuerst speichern.')
  if (!direktErzeugbar(s.inhalt.art)) throw new Error('Diese Schrittart erzeugt die KI nicht direkt.')
  const reiheId = r.id
  void starteAuftrag({
    moduleId: 'unterrichtsreihe',
    docId: reiheId,
    titel: s.titel || 'Schritt',
    art: auftragsArtFuer(s),
    eingabe: { r, s },
    sperrt: false,
    schluessel: platzhalterSchluessel(reiheId, s.id),
    istOffen: () => reiheOffen(reiheId),
    fehlerTitel: 'Schritt für die Reihe konnte nicht erstellt werden',
    arbeit: async ({ r: reihe, s: schritt }, k) => {
      k.melde('Die KI formuliert den Inhalt …')
      return erzeugeSchrittInhalt(reihe, schritt, k.ai)
    },
    ablegen: async (inhalt) => {
      await schrittAendernUeberall(reiheId, s.id, { inhalt, platzhalter: undefined, kiEntwurf: true })
    },
    abschluss: () => 'Schritt erstellt und in der Reihe gespeichert'
  })
}

/**
 * Einen Platzhalter mit der KI füllen – Arbeitsblatt oder anderer Inhalt, beides im Hintergrund. Digitale Reihe (Plan G.2):
 * Zwischenaufgabe, Abschlussprodukt und Selbsteinschätzung entstehen als vollwertiges Arbeitsblatt (in gemischten Reihen
 * auf Wunsch); Lernkarten, Diagnose, Vokabeln und Tests bleiben eigene Arten.
 */
export function erzeugeFuerPlatzhalter(r: Reihe, s: Schritt): void {
  if (s.inhalt.art === 'arbeitsblatt') return erzeugeBlattFuerPlatzhalter(r, s)
  const zweck = blattZweckFuer(r, s)
  if (zweck) erzeugeBlattFuerPlatzhalter(r, s, zweck)
  else erzeugeSchrittFuerPlatzhalter(r, s)
}

/** „Alle Platzhalter erstellen": jeden offenen Platzhalter als Auftrag anstoßen – sie warten auf freie Plätze. Liefert die Zahl. */
export function erzeugeAllePlatzhalter(r: Reihe): number {
  if (!r.id) throw new Error('Bitte die Reihe zuerst speichern.')
  const liste = offenePlatzhalter(r, (id) => erzeugtGerade(r.id, id))
  for (const s of liste) erzeugeFuerPlatzhalter(r, s)
  return liste.length
}
