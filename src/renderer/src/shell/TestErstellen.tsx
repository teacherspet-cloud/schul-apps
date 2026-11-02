/**
 * „Test erstellen lassen" im Fenster „Test zum Termin" (28.10.2026, abgestimmt mit der Lehrkraft: KI im Hintergrund,
 * vorher die Auswahl wie in der jeweiligen App):
 *  - Vokabeltest (Blatt): neuer Test mit den Wörtern der Termin-Abschnitte; die App öffnet sich mit ihren Einstellungen,
 *    „Automatisch erstellen" startet die KI im Hintergrund.
 *  - Grammatiktest: neuer Test mit der Grammatik des Termins vorgewählt; die App öffnet sich mit ihren Einstellungen.
 *  - Onlinetest: entsteht wie in der App aus einem Vokabeltest – hier die Einstellungen des Onlinetests (Zeit, Gäste,
 *    Handschrift); ist der Vokabeltest im Hintergrund fertig, wird der Onlinetest für die Lerngruppe mit dem Termin
 *    angelegt und verknüpft (Wächter `starteTerminWaechter`).
 * Der neue Test ist sofort mit dem Termin verknüpft; „Zurück" führt zur Startseite.
 */
import { Alert, Button, Group, NumberInput, Radio, Stack, Switch, Text } from '@mantine/core'
import { IconSparkles } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen, senden } from '../modules/onlinetest/serverApi'
import { neuAnlegen, useNavigation } from '../shared/navigation'
import { notifyError, notifySuccess } from '../shared/util'
import { useAuftraege } from '../shared/auftraege'
import { useVokabeltest, type TestPayload, type VocabListContext } from '../modules/vokabeltest/store'
import { collectKnownVocab } from '../shared/knownVocab'
import { newId } from '../modules/vokabeltest/model/random'
import { useGrammatiktest } from '../modules/grammatiktest/store'
import { kennungLabel } from '../modules/grammatikformen/grammatikformen'
import { onlinetestName, testThema } from '../modules/onlinetest/OnlinetestKnopf'
import type { TestDocument } from '../modules/vokabeltest/model/types'
import { TEST_APP_NAME, type TestApp } from '@shared/testMaterial'
import type { StartKurs } from '@shared/startseiteKurse'
import { verknuepfen } from './TestZumTermin'
import { druckBlattHtml } from '../modules/onlinetest/blattAnsicht'

interface TerminInhalt {
  sprache: string
  fach: string
  lerngruppeId: string
  gruppe: string
  termin: number | null
  abschnitte: string[]
  /** Band, Unit und Abschnitte des Termins im Lehrwerk (29.10.2026) – Vorwahl im Lehrwerk-Auswähler */
  lehrwerkVorwahl?: { bookId: string; unit: string; sections: string[] } | null
  woerter: { term: string; translation: string }[]
  grammatik: string[]
}

/** Jahrgang aus dem Klassennamen („7b" → 7, „10" → 10; „Q1" → keiner) – wie in „Meine Klassen" */
const jahrgangAusKlasse = (name: string): number | undefined => {
  const n = Number(/^\s*(\d{1,2})(?!\d)/.exec(name)?.[1])
  return Number.isInteger(n) && n >= 1 && n <= 13 ? n : undefined
}

const warte = async (bedingung: () => boolean, ms = 8000): Promise<boolean> => {
  for (let t = 0; t < ms; t += 100) {
    if (bedingung()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return bedingung()
}

// ---------------------------------------------------------------- Onlinetest nach dem Vokabeltest anlegen

interface OffenerOnlinetest {
  kursId: string
  docId: string
  lerngruppeId: string
  gruppe: string
  termin: string
  zeitMin: number
  gaeste: boolean
  handschrift: boolean
}
const OFFEN_KEY = 'sa-termin-onlinetests'
const offene = (): OffenerOnlinetest[] => {
  try {
    return JSON.parse(localStorage.getItem(OFFEN_KEY) ?? '[]') as OffenerOnlinetest[]
  } catch {
    return []
  }
}
const setzeOffene = (l: OffenerOnlinetest[]): void => {
  try {
    localStorage.setItem(OFFEN_KEY, JSON.stringify(l))
  } catch {
    /* egal */
  }
}

async function onlinetestAnlegen(o: OffenerOnlinetest): Promise<void> {
  const s = useVokabeltest.getState()
  const doc = (s.testId === o.docId && s.doc ? s.doc : ((await window.api.tests.get(o.docId)).payload as TestPayload).doc) as TestDocument | null
  if (!doc?.variants?.length) throw new Error('Der Vokabeltest hat noch keine Fassung.')
  const titel = onlinetestName(doc, o.gruppe, new Date(`${o.termin}T08:00:00`))
  const r = await senden<{ id: string }>('/server/onlinetest/erstellen', {
    titel,
    thema: testThema(doc),
    test: doc,
    // „Als Blatt ansehen" für die Lernenden (02.11.2026)
    blaetter: doc.variants.map((v) => druckBlattHtml(doc, v)),
    lerngruppeId: o.lerngruppeId,
    handschrift: o.handschrift,
    gaeste: o.gaeste,
    termin: o.termin,
    terminVerborgen: false,
    zeitMin: o.zeitMin,
    zuteilung: 'zufall'
  })
  await verknuepfen(o.kursId, { moduleId: 'onlinetest', docId: r.id, titel })
  notifySuccess(`Onlinetest „${titel}“ ist angelegt und mit dem Termin verknüpft.`)
}

let waechter = false
/** Einmal je App: ist der Vokabeltest eines Termin-Onlinetests fertig, den Onlinetest anlegen */
export function starteTerminWaechter(): void {
  if (waechter) return
  waechter = true
  useAuftraege.subscribe((s, prev) => {
    if (s.auftraege === prev.auftraege) return
    const offen = offene()
    if (!offen.length) return
    for (const a of s.auftraege) {
      if (a.status !== 'fertig' || prev.auftraege.find((x) => x.id === a.id)?.status === 'fertig') continue
      const o = offen.find((x) => a.moduleId === 'vokabeltest' && x.docId === a.docId)
      if (!o) continue
      setzeOffene(offene().filter((x) => x.docId !== o.docId))
      void new Promise((r) => setTimeout(r, 800))
        .then(() => onlinetestAnlegen(o))
        .catch((e: unknown) => {
          setzeOffene([...offene(), o])
          notifyError(e, 'Onlinetest zum Termin nicht angelegt')
        })
    }
  })
}

// ---------------------------------------------------------------- Fenster

export function TestErstellen({ k, fertig }: { k: StartKurs; stichwoerter: string[]; fertig: () => void }): React.JSX.Element {
  const [inhalt, setInhalt] = useState<TerminInhalt | null>(null)
  const [fehler, setFehler] = useState('')
  const [app, setApp] = useState<TestApp>('vokabeltest')
  const [zeit, setZeit] = useState<number>(20)
  const [gaeste, setGaeste] = useState(true)
  const [handschrift, setHandschrift] = useState(true)
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<TerminInhalt>(`/server/vokabeln/${k.id}/testinhalt`).then(
      (d) => {
        setInhalt(d)
        if (!d.woerter.length && d.grammatik.length) setApp('grammatiktest')
      },
      (e: unknown) => setFehler(e instanceof Error ? e.message : String(e))
    )
  }, [k.id])
  if (fehler) return <Alert color="red">{fehler}</Alert>
  if (!inhalt)
    return (
      <Text size="sm" c="dimmed">
        Lädt …
      </Text>
    )
  const terminTag = inhalt.termin ? new Date(inhalt.termin).toLocaleDateString('sv-SE') : ''
  const titel = `${inhalt.gruppe ? `${inhalt.gruppe} ` : ''}${inhalt.abschnitte.join(', ') || inhalt.fach}`.trim()

  const vokabeltestAnlegen = async (): Promise<string | null> => {
    useNavigation.getState().setRueckweg({ fuer: 'vokabeltest', nach: 'home', name: 'Zur Startseite' })
    const id = await neuAnlegen('vokabeltest')
    if (!id) return null
    const v = useVokabeltest.getState()
    v.setVocab(inhalt.woerter.map((w) => ({ id: newId(), term: w.term, translation: w.translation })))
    v.setListName(titel)
    /*
     * Klassenstufe gleich mitgeben (02.11.2026, Befund der Lehrkraft: „Test automatisch erstellen" trug Klasse und Niveau
     * erst ein, nachdem die KI die Vokabeln analysiert hatte): Jahrgang aus dem Namen der Lerngruppe („9c" → 9), sonst aus
     * dem Band des Termins; Bundesland/Schulform und der bekannte Wortschatz früherer Units ebenfalls aus dem Band.
     */
    const kontext: VocabListContext = { bookName: inhalt.abschnitte.join(' · ') || titel, language: inhalt.sprache }
    const jahrgang = jahrgangAusKlasse(inhalt.gruppe)
    const vw = inhalt.lehrwerkVorwahl
    if (vw?.bookId)
      try {
        const book = await window.api.textbooks.get(vw.bookId)
        if (book) {
          Object.assign(kontext, {
            ...(book.grade ? { grade: book.grade } : {}),
            ...(book.stateId ? { stateId: book.stateId } : {}),
            ...(book.schoolTypeId ? { schoolTypeId: book.schoolTypeId } : {}),
            language: inhalt.sprache || book.language
          })
          const known = await collectKnownVocab(book, vw.unit, vw.sections, jahrgang ?? book.grade ?? 99, await window.api.textbooks.list(), (id) =>
            window.api.textbooks.get(id)
          )
          if (known) kontext.known = known
        }
      } catch {
        /* ohne Band: nur der Jahrgang der Lerngruppe */
      }
    if (jahrgang) kontext.grade = jahrgang
    v.setListContext(kontext)
    // Lehrwerk, Band, Unit und Abschnitte des Termins vorwählen (29.10.2026, Befund der Lehrkraft)
    v.setLehrwerkVorwahl(inhalt.lehrwerkVorwahl ?? null)
    return id
  }
  const los = async (): Promise<void> => {
    setLaeuft(true)
    try {
      if (app === 'grammatiktest') {
        useNavigation.getState().setRueckweg({ fuer: 'grammatiktest', nach: 'home', name: 'Zur Startseite' })
        const id = await neuAnlegen('grammatiktest')
        if (!id) throw new Error('Der Grammatiktest ließ sich nicht anlegen.')
        if (await warte(() => Boolean(useGrammatiktest.getState().test) && useGrammatiktest.getState().docId === id)) {
          const themen = [...new Set(inhalt.grammatik.map((x) => x.split('/')[0]))]
          const teil = inhalt.grammatik.filter((x) => x.includes('/'))
          useGrammatiktest.getState().update((d) => {
            d.meta.topics = themen
            if (teil.length) d.meta.teilformen = teil
            d.meta.title = titel
          })
        }
        await verknuepfen(k.id, { moduleId: 'grammatiktest', docId: id, titel })
        notifySuccess('Grammatik des Termins übernommen – Einstellungen prüfen und „Erstellen" wählen. Der Test ist mit dem Termin verknüpft.')
      } else {
        const id = await vokabeltestAnlegen()
        if (!id) throw new Error('Der Vokabeltest ließ sich nicht anlegen.')
        if (app === 'onlinetest') {
          setzeOffene([
            ...offene().filter((x) => x.kursId !== k.id),
            { kursId: k.id, docId: id, lerngruppeId: inhalt.lerngruppeId, gruppe: inhalt.gruppe, termin: terminTag, zeitMin: zeit, gaeste, handschrift }
          ])
          starteTerminWaechter()
          notifySuccess('Wörter übernommen – Einstellungen prüfen und „Automatisch erstellen" wählen. Danach wird der Onlinetest zum Termin angelegt.')
        } else {
          await verknuepfen(k.id, { moduleId: 'vokabeltest', docId: id, titel })
          notifySuccess('Wörter übernommen – Einstellungen prüfen und „Automatisch erstellen" wählen. Der Test ist mit dem Termin verknüpft.')
        }
      }
      fertig()
    } catch (e) {
      notifyError(e, 'Test nicht angelegt')
    } finally {
      setLaeuft(false)
    }
  }
  const moeglich: TestApp[] = [...(inhalt.woerter.length ? (['vokabeltest', 'onlinetest'] as TestApp[]) : []), ...(inhalt.grammatik.length ? (['grammatiktest'] as TestApp[]) : [])]
  return (
    <Stack gap="sm" data-test-erstellen>
      <Text size="sm">
        {inhalt.woerter.length} Wörter aus {inhalt.abschnitte.length ? inhalt.abschnitte.join(' · ') : 'dem Kurs'}
        {inhalt.grammatik.length ? ` · Grammatik: ${inhalt.grammatik.map(kennungLabel).join(', ')}` : ''}
      </Text>
      {!moeglich.length ? (
        <Alert color="orange">Für diesen Termin sind keine Abschnitte oder Grammatik gewählt – festzulegen in den Kurseinstellungen unter „Testtermin“.</Alert>
      ) : (
        <>
          <Radio.Group value={app} onChange={(v) => setApp(v as TestApp)} label="Welcher Test?">
            <Stack gap={6} mt={4}>
              {moeglich.map((a) => (
                <Radio key={a} value={a} label={TEST_APP_NAME[a]} data-test-app={a} />
              ))}
            </Stack>
          </Radio.Group>
          {app === 'onlinetest' && (
            <Group gap="md" align="flex-end">
              <NumberInput label="Zeit (Minuten)" value={zeit} onChange={(v) => setZeit(Math.max(5, Math.min(120, Number(v) || 20)))} min={5} max={120} w={140} />
              <Switch label="Auch Gäste mit Namen" checked={gaeste} onChange={(e) => setGaeste(e.currentTarget.checked)} />
              <Switch label="Handschrift erlaubt" checked={handschrift} onChange={(e) => setHandschrift(e.currentTarget.checked)} />
            </Group>
          )}
          <Text size="xs" c="dimmed">
            {app === 'grammatiktest'
              ? 'Der Grammatiktest öffnet sich mit der Grammatik des Termins. Dort Umfang, Niveau und Aufgaben wie gewohnt wählen; die KI arbeitet im Hintergrund.'
              : app === 'onlinetest'
                ? `Erst entsteht der Vokabeltest (Einstellungen wie in der App, die KI arbeitet im Hintergrund), dann der Onlinetest für ${inhalt.gruppe || 'die Lerngruppe'} am ${inhalt.termin ? new Date(inhalt.termin).toLocaleDateString('de-DE') : 'Termin'}.`
                : 'Der Vokabeltest öffnet sich mit den Wörtern des Termins. Dort Punkte, Niveau und Aufgabenarten wie gewohnt wählen; die KI arbeitet im Hintergrund.'}
          </Text>
          <Group>
            <Button leftSection={<IconSparkles size={16} />} loading={laeuft} onClick={() => void los()} data-test-erstellen-los>
              Weiter zu den Einstellungen
            </Button>
          </Group>
        </>
      )}
    </Stack>
  )
}
