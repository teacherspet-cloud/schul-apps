/**
 * „Test hier erstellen" – Ablauf in der App (06.10.2026, reiheTest.ts): Editor vorbefüllt öffnen (Rückweg in die Reihe)
 * und – sobald der Auftrag dort fertig ist – den Platzhalter in der Reihe durch den fertigen Test ersetzen.
 *
 * Die Test-Programme selbst bleiben unberührt: Vorbefüllt wird über ihre Stores, nachdem sie ein neues Dokument
 * angelegt haben (`neuAnlegen`); Fach, Land, Schulform und Jahrgang über die gemerkte Auswahl bzw. die Fachvorgabe.
 */
import type { Schritt } from '@shared/reihe'
import { useAuftraege } from '../../shared/auftraege'
import { setzeFachVorgabe } from '../../shared/fachVorgabe'
import { thresholdsForSubject } from '../../shared/gradeScale'
import { saveLastChoice } from '../../shared/lastChoice'
import { neuAnlegen, useNavigation } from '../../shared/navigation'
import { useAppSettings } from '../../shared/settingsStore'
import { notifyError, notifySuccess } from '../../shared/util'
import { examMinutes, examPoints, type Exam } from '../klassenarbeit/model/types'
import { useKlassenarbeit } from '../klassenarbeit/store'
import type { Kurztest } from '../lernzielkontrolle/model/types'
import { kurztestToWorksheetAlle } from '../lernzielkontrolle/render/kurztestWorksheet'
import { useLernzielkontrolle } from '../lernzielkontrolle/store'
import { fassungenAusBlatt } from '../onlinetest/blattOnline'
import type { TestDocument } from '../vokabeltest/model/types'
import { newId } from '../vokabeltest/model/random'
import { useVokabeltest, type TestPayload } from '../vokabeltest/store'
import { schrittAendernUeberall } from './platzhalterAuftrag'
import { offeneTests, passenderTest, setzeOffeneTests, type OffenerTest, type TestGrundlage, type TestZiel } from './reiheTest'
import type { Reihe } from '@shared/reihe'

const warte = async (bedingung: () => boolean, ms = 8000): Promise<boolean> => {
  for (let t = 0; t < ms; t += 100) {
    if (bedingung()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return bedingung()
}

/** Editor öffnen und vorbefüllen; liefert die Kennung des neuen Dokuments (null: ging nicht, z. B. im eigenen Fenster) */
export async function oeffneTestEditor(ziel: TestZiel, r: Reihe, g: TestGrundlage): Promise<string | null> {
  // Land, Schulform, Jahrgang und Fach der Reihe gelten im neuen Dokument
  saveLastChoice(ziel, { stateId: r.stateId, schoolTypeId: r.schoolTypeId, grade: r.grade })
  setzeFachVorgabe(ziel, r.fachId)
  useNavigation.getState().setRueckweg({ fuer: ziel, nach: 'unterrichtsreihe', name: 'Zurück zur Reihe' })
  const id = await neuAnlegen(ziel)
  if (!id) {
    useNavigation.getState().setRueckweg(null)
    return null
  }
  if (ziel === 'klassenarbeit') {
    // Der Rahmen legt die neue Arbeit an, sobald die Länderdaten geladen sind
    if (await warte(() => Boolean(useKlassenarbeit.getState().exam) && useKlassenarbeit.getState().docId === id))
      useKlassenarbeit.getState().update((d) => {
        d.meta.title = g.titel
        d.meta.topic = g.thema
        d.meta.content = g.stoff
        if (d.meta.grade !== r.grade) d.meta.grade = r.grade
      })
  } else if (ziel === 'lernzielkontrolle') {
    if (await warte(() => Boolean(useLernzielkontrolle.getState().test) && useLernzielkontrolle.getState().docId === id))
      useLernzielkontrolle.getState().update((d) => {
        d.meta.title = g.titel
        d.meta.thema = g.thema
        d.meta.stoff = g.stoff
        d.meta.grade = r.grade
      })
  } else {
    const v = useVokabeltest.getState()
    v.setVocab(g.woerter.map((w) => ({ id: newId(), term: w.term, translation: w.translation })))
    v.setListName(g.titel)
    v.setListContext({ bookName: r.titel, grade: r.grade, stateId: r.stateId, schoolTypeId: r.schoolTypeId })
  }
  return id
}

/** Gespeichertes oder offenes Dokument laden */
async function ladeDokument(o: OffenerTest): Promise<unknown> {
  if (o.modul === 'klassenarbeit') {
    const s = useKlassenarbeit.getState()
    return s.docId === o.docId && s.exam ? s.exam : (await window.api.exams.get(o.docId)).payload
  }
  if (o.modul === 'lernzielkontrolle') {
    const s = useLernzielkontrolle.getState()
    return s.docId === o.docId && s.test ? s.test : (await window.api.kurztests.get(o.docId)).payload
  }
  const s = useVokabeltest.getState()
  return s.testId === o.docId && s.doc ? s.doc : ((await window.api.tests.get(o.docId)).payload as TestPayload).doc
}

/** Der fertige Test als Schritt (ersetzt den Platzhalter) */
export async function testAlsSchritt(o: OffenerTest): Promise<Partial<Schritt>> {
  const dok = await ladeDokument(o)
  if (o.modul === 'klassenarbeit') {
    const e = dok as Exam
    const titel = e.meta.title || e.meta.topic || 'Klassenarbeit'
    return {
      titel: `${titel} (schriftlich)`,
      inhalt: {
        art: 'praesenz',
        anweisung: `Schriftliche Klassenarbeit „${titel}" im Unterricht – ${examMinutes(e)} Minuten, ${examPoints(
          e
        )} Punkte. Deine Lehrkraft hakt ab, sobald sie geschrieben ist.`
      },
      erfolg: { art: 'lehrkraft' },
      platzhalter: undefined
    }
  }
  if (o.modul === 'lernzielkontrolle') {
    const t = dok as Kurztest
    const { settings, logoDataUrl } = useAppSettings.getState()
    const titel = t.meta.title || t.meta.thema || 'Lernzielkontrolle'
    try {
      const fassungen = fassungenAusBlatt(
        kurztestToWorksheetAlle(t, thresholdsForSubject(settings.gradeScale, t.meta.subjectId)),
        logoDataUrl ?? null,
        settings.schoolName ?? ''
      )
      return {
        titel,
        inhalt: {
          art: 'onlinetest',
          test: null,
          zeitMin: Math.max(5, Math.round(t.meta.minutes || 20)),
          blatt: { art: 'Lernzielkontrolle', fach: t.meta.subjectLabel, thema: t.meta.thema, fassungen, quelle: o.docId }
        },
        erfolg: { art: 'punkte', prozent: 60 },
        platzhalter: undefined
      }
    } catch {
      // Keine online bearbeitbaren Aufgaben: dann schriftlich im Unterricht
      return {
        titel: `${titel} (schriftlich)`,
        inhalt: { art: 'praesenz', anweisung: `Lernzielkontrolle „${titel}" im Unterricht schreiben.` },
        erfolg: { art: 'lehrkraft' },
        platzhalter: undefined
      }
    }
  }
  const doc = dok as TestDocument | null
  if (!doc?.variants?.length) throw new Error('Der Vokabeltest hat noch keine Fassung.')
  return {
    titel: doc.header?.title || 'Vokabeltest',
    inhalt: { art: 'onlinetest', test: doc, zeitMin: 15 },
    erfolg: { art: 'punkte', prozent: 60 },
    platzhalter: undefined
  }
}

/** Platzhalter merken: Sobald der Auftrag im Test-Programm fertig ist, wird er zum Schritt */
export function merkeOffenenTest(o: OffenerTest): void {
  setzeOffeneTests([...offeneTests().filter((x) => x.schrittId !== o.schrittId), o])
}

let waechter = false
/** Einmal je App: fertige Aufträge der Test-Programme auf offene Reihen-Tests prüfen */
export function starteTestWaechter(): void {
  if (waechter) return
  waechter = true
  useAuftraege.subscribe((s, prev) => {
    if (s.auftraege === prev.auftraege) return
    const offen = offeneTests()
    if (!offen.length) return
    for (const a of s.auftraege) {
      const vorher = prev.auftraege.find((x) => x.id === a.id)
      if (vorher?.status === 'fertig') continue
      const o = passenderTest(offen, a)
      if (!o) continue
      setzeOffeneTests(offeneTests().filter((x) => x.schrittId !== o.schrittId))
      // Kurz warten: Das Programm legt das Ergebnis gerade ab (Store bzw. Ablage)
      void new Promise((r) => setTimeout(r, 800))
        .then(() => testAlsSchritt(o))
        .then((patch) =>
          schrittAendernUeberall(o.reiheId, o.schrittId, patch).then(() => notifySuccess(`„${patch.titel}" steht jetzt als Schritt in der Reihe.`))
        )
        .catch((e: unknown) => {
          // Nicht verloren: beim nächsten fertigen Auftrag erneut versuchen
          merkeOffenenTest(o)
          notifyError(e, 'Test nicht in die Reihe übernommen')
        })
    }
  })
}
