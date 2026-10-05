/**
 * Einen Schritt der Unterrichtsreihe bearbeiten: Inhalt je Art, Rolle (Pflicht/Wahl/Förder/Forder),
 * Erfolg, Haltepunkt, Abschnitt und Lernziele des Schritts.
 */
import { mitBildern, VokabelQuelle } from '../lernen/VokabelQuelle'
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea
} from '@mantine/core'
import { useEffect, useState } from 'react'
import type { Erfolg, Reihe, Schritt, SchrittInhalt } from '@shared/reihe'
import { SCHRITT_ARTEN } from '@shared/reihe'
import { notifyError } from '../../shared/util'
import { useAppSettings } from '../../shared/settingsStore'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { buildWorksheetHtml } from '../arbeitsblatt/render/printHtml'
import { blattAufgaben, blattMerkkaesten, blattRueckmeldung, loesungFuerLernende } from '../arbeitsblatt/BlattFreigabeKnopf'
import { LernzieleFeld } from './Lernziele'
import { schrittLernziele } from './lernzieleKi'

const ki = <T,>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> => window.api.ai.structured<T>(req)

/** Kurzbeschreibung des Inhalts – Grundlage für die Lernziel-Vorschläge der KI */
function beschreibung(i: SchrittInhalt): string {
  switch (i.art) {
    case 'arbeitsblatt':
      return i.aufgaben.map((a) => `Aufgabe ${a.nr}: ${a.anweisung}`).join('\n')
    case 'aufgabe':
      return [i.anweisung, i.material, ...i.fragen].join('\n')
    case 'lernkarten':
      return i.karten.map((k) => `${k.vorne} – ${k.hinten}`).join('\n')
    case 'abschluss':
      return [i.anweisung, ...i.raster].join('\n')
    case 'sprechen':
    case 'praesenz':
      return i.anweisung
    case 'diagnose':
      return i.fragen.map((f) => f.frage).join('\n')
    case 'hefter':
      return i.text
    default:
      return ''
  }
}

/** Lernziele eines Arbeitsblatts (Baustein „Lernziele") */
function blattLernziele(ws: Worksheet, sheetId: string): { text: string; ichKann: string }[] {
  const sheet = ws.sheets.find((s) => s.id === sheetId)
  const block = sheet?.blocks.find((b) => b.type === 'learningGoals') as { goals?: string[] } | undefined
  return (block?.goals ?? []).map((g) => ({ text: g, ichKann: g }))
}

export function SchrittBearbeiten({
  reihe,
  schritt,
  speichern,
  schliessen,
  teile = []
}: {
  reihe: Reihe
  schritt: Schritt
  speichern: (s: Schritt) => void
  schliessen: () => void
  /** Teile der Reihe zur Auswahl */
  teile?: string[]
}): React.JSX.Element {
  const [s, setS] = useState<Schritt>(schritt)
  const setze = (teil: Partial<Schritt>): void => setS((x) => ({ ...x, ...teil }))
  const setzeInhalt = (teil: Record<string, unknown>): void => setS((x) => ({ ...x, inhalt: { ...x.inhalt, ...teil } as SchrittInhalt }))
  const art = SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)
  const andere = reihe.schritte.filter((x) => x.id !== s.id)
  const erfolgWahl: { value: Erfolg['art']; label: string }[] = [
    ...(['arbeitsblatt', 'rueckmeldung', 'aufgabe'].includes(s.inhalt.art) ? [{ value: 'ki' as const, label: 'KI-Rückmeldung' }] : []),
    ...(s.inhalt.art === 'onlinetest' ? [{ value: 'punkte' as const, label: 'Mindestpunkte' }] : []),
    ...(s.inhalt.art === 'vokabeln' ? [{ value: 'punkte' as const, label: 'Anteil eingeübter Wörter' }] : []),
    { value: 'lehrkraft', label: 'Lehrkraft bestätigt' },
    { value: 'abgabe', label: 'Abgegeben genügt' }
  ]
  return (
    <Modal opened onClose={schliessen} title={`${art?.label ?? 'Schritt'} bearbeiten`} size="xl">
      <Stack>
        <TextInput label="Titel (sehen die Lernenden)" value={s.titel} onChange={(e) => setze({ titel: e.currentTarget.value })} data-schritt-titel />
        <Inhalt s={s} setzeInhalt={setzeInhalt} setze={setze} reihe={reihe} />
        <Divider />
        <LernzieleFeld
          titel="Lernziele dieses Schritts"
          ziele={s.lernziele}
          setze={(l) => setze({ lernziele: l })}
          vorschlagen={() => schrittLernziele(reihe, s, beschreibung(s.inhalt), ki)}
        />
        <Divider />
        <Group grow align="start">
          <Select
            label="Rolle"
            value={s.rolle}
            onChange={(v) => v && setze({ rolle: v as Schritt['rolle'] })}
            allowDeselect={false}
            data={[
              { value: 'pflicht', label: 'Pflicht' },
              { value: 'wahl', label: 'Wahl („wähle n von …")' },
              { value: 'foerder', label: 'Förderschritt (bei Bedarf)' },
              { value: 'forder', label: 'Forderschritt ★ (freiwillig)' }
            ]}
          />
          {s.rolle === 'wahl' && (
            <>
              <TextInput
                label="Wahlgruppe"
                description="Gleicher Name = eine Gruppe"
                value={s.wahlGruppe ?? ''}
                onChange={(e) => setze({ wahlGruppe: e.currentTarget.value })}
              />
              <NumberInput label="Davon nötig" min={1} max={10} value={s.wahlMindestens ?? 1} onChange={(v) => setze({ wahlMindestens: Number(v) || 1 })} />
            </>
          )}
          {s.rolle === 'foerder' && (
            <Select
              label="Fördert bei"
              data={andere.filter((x) => x.rolle !== 'foerder').map((x) => ({ value: x.id, label: x.titel || x.id }))}
              value={s.foerderFuer ?? null}
              onChange={(v) => setze({ foerderFuer: v ?? undefined })}
            />
          )}
        </Group>
        <Group grow align="start">
          <Select
            label="Teil"
            description="Abzeichen, sobald alle Pflichtschritte eines Teils geschafft sind"
            data={teile}
            value={s.abschnitt ?? null}
            onChange={(v) => setze({ abschnitt: v ?? undefined })}
            clearable
            placeholder="ohne Teil"
            data-schritt-teil
          />
          <Select
            label="Haltepunkt davor"
            value={s.halt?.art ?? 'kein'}
            onChange={(v) =>
              setze({ halt: v === 'freigabe' ? { art: 'freigabe' } : v === 'datum' ? { art: 'datum', ab: new Date().toISOString().slice(0, 10) } : undefined })
            }
            allowDeselect={false}
            data={[
              { value: 'kein', label: 'kein Haltepunkt' },
              { value: 'freigabe', label: 'nach gemeinsamer Besprechung (ich gebe frei)' },
              { value: 'datum', label: 'ab einem Datum' }
            ]}
          />
          {s.halt?.art === 'datum' && (
            <TextInput label="ab" type="date" value={s.halt.ab.slice(0, 10)} onChange={(e) => setze({ halt: { art: 'datum', ab: e.currentTarget.value } })} />
          )}
        </Group>
        {!['lernkarten', 'reflexion', 'hefter', 'diagnose', 'praesenz'].includes(s.inhalt.art) && (
          <Group align="end">
            <Select
              label="Geschafft, wenn …"
              value={s.erfolg.art}
              allowDeselect={false}
              data={erfolgWahl}
              onChange={(v) =>
                setze({
                  erfolg:
                    v === 'ki'
                      ? { art: 'ki', schwelle: 'teilweise' }
                      : v === 'punkte'
                        ? { art: 'punkte', prozent: 60 }
                        : v === 'lehrkraft'
                          ? { art: 'lehrkraft' }
                          : { art: 'abgabe' }
                })
              }
              w={240}
            />
            {s.erfolg.art === 'ki' && (
              <Select
                label="alle Kriterien mindestens"
                value={s.erfolg.schwelle}
                allowDeselect={false}
                data={[
                  { value: 'teilweise', label: 'teilweise erfüllt' },
                  { value: 'sicher', label: 'sicher erfüllt' }
                ]}
                onChange={(v) => setze({ erfolg: { art: 'ki', schwelle: (v as 'teilweise' | 'sicher') ?? 'teilweise' } })}
                w={220}
              />
            )}
            {s.erfolg.art === 'punkte' && (
              <NumberInput
                label="mindestens (%)"
                min={0}
                max={100}
                value={s.erfolg.prozent}
                onChange={(v) => setze({ erfolg: { art: 'punkte', prozent: Number(v) || 0 } })}
                w={160}
              />
            )}
          </Group>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button onClick={() => speichern(s)} disabled={!s.titel.trim()} data-schritt-speichern>
            Übernehmen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Auswahl aus einer Ablage */
function AusAblage(props: {
  label: string
  laden: () => Promise<{ id: string; name: string }[]>
  gewaehlt: (id: string) => Promise<void>
  aktuell?: string
}): React.JSX.Element {
  const [liste, setListe] = useState<{ id: string; name: string }[]>([])
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void props.laden().then(setListe, () => setListe([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <Select
      label={props.label}
      searchable
      placeholder={liste.length ? 'aus „Meine …“ wählen' : 'noch nichts gespeichert'}
      data={liste.map((x) => ({ value: x.id, label: x.name }))}
      value={null}
      disabled={laeuft}
      description={props.aktuell ? `Gewählt: ${props.aktuell}` : undefined}
      onChange={(id) => {
        if (!id) return
        setLaeuft(true)
        void props
          .gewaehlt(id)
          .catch((e: unknown) => notifyError(e))
          .finally(() => setLaeuft(false))
      }}
      data-ablage-wahl
    />
  )
}

function Inhalt({
  s,
  setzeInhalt,
  setze,
  reihe
}: {
  s: Schritt
  setzeInhalt: (t: Record<string, unknown>) => void
  setze: (t: Partial<Schritt>) => void
  reihe: Reihe
}): React.JSX.Element {
  const i = s.inhalt
  const { logoDataUrl, settings } = useAppSettings.getState()
  switch (i.art) {
    case 'arbeitsblatt':
      return (
        <Stack gap="xs">
          <AusAblage
            label="Arbeitsblatt"
            aktuell={i.titel}
            laden={async () => (await window.api.sheets.list()).map((m) => ({ id: m.id, name: m.name }))}
            gewaehlt={async (id) => {
              const w = await window.api.sheets.get(id)
              const ws = w.payload as Worksheet
              const sheet = ws.sheets[0]
              if (!sheet) throw new Error('Das Arbeitsblatt ist leer.')
              const titel = ws.meta.title || ws.meta.topic || w.name
              // Schülerfassung ohne Lösungen; Lösungen und Erwartungen nur für den Server
              const html = buildWorksheetHtml(ws, new Map(), { sheetIds: [sheet.id], includeKey: false }, logoDataUrl ?? null, settings.schoolName ?? '')
              // Lösungsblatt (sehen die Lernenden nach dem ersten Einreichen) und Niveaustufen aus den Blättern
              const loesung = (sid: string): string =>
                loesungFuerLernende(
                  buildWorksheetHtml(ws, new Map(), { sheetIds: [sid], includeKey: false, keyOnly: true }, logoDataUrl ?? null, settings.schoolName ?? '')
                )
              const varianten =
                ws.sheets.length > 1
                  ? ws.sheets.map((sh, k) => ({
                      label: sh.label || ['Basis', 'Standard', 'Plus'][k] || `Stufe ${k + 1}`,
                      html: buildWorksheetHtml(ws, new Map(), { sheetIds: [sh.id], includeKey: false }, logoDataUrl ?? null, settings.schoolName ?? ''),
                      aufgaben: blattAufgaben(sh),
                      vorlage: blattRueckmeldung(ws, sh, titel),
                      loesung: loesung(sh.id),
                      merk: blattMerkkaesten(sh)
                    }))
                  : undefined
              setzeInhalt({
                quelle: id,
                titel,
                html,
                aufgaben: blattAufgaben(sheet),
                vorlage: blattRueckmeldung(ws, sheet, titel),
                merk: blattMerkkaesten(sheet),
                loesung: loesung(sheet.id),
                varianten
              })
              setze({ ...(s.titel ? {} : { titel }), ...(s.lernziele.length ? {} : { lernziele: blattLernziele(ws, sheet.id) }) })
            }}
          />
          <Group>
            <NumberInput label="Einreichungen je Person" min={1} max={5} value={i.runden} onChange={(v) => setzeInhalt({ runden: Number(v) || 2 })} w={200} />
            <Checkbox mt="lg" label="Stift erlauben" checked={i.stift} onChange={(e) => setzeInhalt({ stift: e.currentTarget.checked })} />
            <Checkbox
              mt="lg"
              label="Aufgaben schrittweise freischalten"
              title="Die nächste Aufgabe erscheint erst, wenn die vorige mindestens teilweise treffend gelöst ist; Ampel neben jeder Aufgabe"
              checked={Boolean(i.schrittweise)}
              onChange={(e) => setzeInhalt({ schrittweise: e.currentTarget.checked })}
              data-schritt-schrittweise
            />
            {(i.merk?.length ?? 0) > 0 && (
              <Checkbox
                mt="lg"
                label="Merkkästen erst am Ende"
                title="Merkkästen erst nach vollständiger Bearbeitung des Blatts zeigen"
                checked={Boolean(i.merkAmEnde)}
                onChange={(e) => setzeInhalt({ merkAmEnde: e.currentTarget.checked })}
              />
            )}
            <Checkbox
              mt="lg"
              label="Lösung nach dem Einreichen"
              checked={Boolean(i.loesung)}
              onChange={(e) => setzeInhalt({ loesung: e.currentTarget.checked ? i.loesung || ' ' : '' })}
            />
          </Group>
          {(i.varianten?.length ?? 0) > 1 && (
            <Alert variant="light" color="grape">
              Niveaustufen: {i.varianten!.map((v) => v.label).join(' · ')} – die Lernenden wählen selbst; nach einer Eingangsdiagnose schlägt die App eine Stufe
              vor.
              <Checkbox mt="xs" label="Niveaustufen anbieten" checked onChange={(e) => !e.currentTarget.checked && setzeInhalt({ varianten: undefined })} />
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            Ausfüllen auf dem Blatt (Telefon: Liste), KI-Feedback je Aufgabe und nach dem Einreichen. Änderungen am Blatt danach gelten nur für neue
            Zuweisungen.
          </Text>
        </Stack>
      )
    case 'rueckmeldung':
      return (
        <Stack gap="xs">
          <AusAblage
            label="Rückmeldung (Aufgabe mit Erwartung)"
            aktuell={i.vorlage ? ((i.vorlage as { meta?: { title?: string } }).meta?.title ?? 'gewählt') : undefined}
            laden={async () => (await window.api.rueckmeldungen.list()).map((m) => ({ id: m.id, name: m.name }))}
            gewaehlt={async (id) => {
              const d = await window.api.rueckmeldungen.get(id)
              const r = d.payload as { meta?: { title?: string }; grundlage?: { aufgaben?: string }; abgaben?: unknown[] }
              if (!r?.grundlage?.aufgaben?.trim()) throw new Error('Diese Rückmeldung hat noch keine Aufgabenstellung.')
              // Nur die Vorlage – keine Abgaben (fremde Schülerdaten)
              setzeInhalt({ vorlage: { ...r, abgaben: [] } })
              if (!s.titel) setze({ titel: r.meta?.title || d.name })
            }}
          />
          <NumberInput label="Feedback-Runden je Person" min={1} max={10} value={i.runden} onChange={(v) => setzeInhalt({ runden: Number(v) || 2 })} w={220} />
        </Stack>
      )
    case 'onlinetest':
      return (
        <Stack gap="xs">
          <AusAblage
            label="Vokabeltest"
            aktuell={i.test ? ((i.test as { header?: { title?: string } }).header?.title ?? 'gewählt') : undefined}
            laden={async () => (await window.api.tests.list()).map((m) => ({ id: m.id, name: m.name }))}
            gewaehlt={async (id) => {
              const t = await window.api.tests.get(id)
              setzeInhalt({ test: t.payload })
              if (!s.titel) setze({ titel: t.name })
            }}
          />
          <NumberInput label="Zeitlimit (Minuten)" min={1} max={240} value={i.zeitMin} onChange={(v) => setzeInhalt({ zeitMin: Number(v) || 20 })} w={200} />
          <Text size="xs" c="dimmed">
            Im eigenen Tempo: Der Test startet, wenn jemand ihn öffnet; das Ergebnis erscheint gleich nach der Abgabe.
          </Text>
        </Stack>
      )
    case 'aufgabe':
      return (
        <Stack gap="xs">
          <Textarea
            label="Auftrag"
            autosize
            minRows={2}
            value={i.anweisung}
            onChange={(e) => setzeInhalt({ anweisung: e.currentTarget.value })}
            data-aufgabe-anweisung
          />
          <Textarea
            label="Material (Lesetext, Hörtext-Skript …)"
            autosize
            minRows={2}
            maxRows={10}
            value={i.material}
            onChange={(e) => setzeInhalt({ material: e.currentTarget.value })}
          />
          <TextInput label="Link (Video, Hörtext, Webseite)" value={i.link} onChange={(e) => setzeInhalt({ link: e.currentTarget.value })} />
          <Textarea
            label="Kontrollfragen (eine je Zeile)"
            autosize
            minRows={2}
            value={i.fragen.join('\n')}
            onChange={(e) =>
              setzeInhalt({
                fragen: e.currentTarget.value
                  .split('\n')
                  .map((x) => x.trim())
                  .filter(Boolean)
              })
            }
          />
          <Group>
            <SegmentedControl
              value={i.antwort}
              onChange={(v) => setzeInhalt({ antwort: v })}
              data={[
                { value: 'text', label: 'Text' },
                { value: 'foto', label: 'Foto' },
                { value: 'beides', label: 'Text + Foto' }
              ]}
            />
            <Checkbox label="KI-Feedback" checked={i.feedback} onChange={(e) => setzeInhalt({ feedback: e.currentTarget.checked })} />
          </Group>
          <Textarea
            label="Musterlösung (sehen die Lernenden nach dem Abgeben)"
            autosize
            minRows={2}
            value={i.musterloesung ?? ''}
            onChange={(e) => setzeInhalt({ musterloesung: e.currentTarget.value })}
          />
          {i.feedback && (
            <Textarea
              label="Erwartung (nur für die KI)"
              autosize
              minRows={2}
              value={i.erwartung}
              onChange={(e) => setzeInhalt({ erwartung: e.currentTarget.value })}
              description="Was eine gute Antwort enthält – die Lernenden sehen das nicht."
            />
          )}
        </Stack>
      )
    case 'lernkarten':
      return (
        <Textarea
          label="Karten (eine je Zeile: Vorderseite = Rückseite)"
          autosize
          minRows={4}
          maxRows={16}
          defaultValue={i.karten.map((k) => `${k.vorne} = ${k.hinten}`).join('\n')}
          onChange={(e) =>
            setzeInhalt({
              karten: e.currentTarget.value
                .split('\n')
                .map((z) => z.split(/\s*[=;\t]\s*/))
                .filter((t) => t[0]?.trim() && t[1]?.trim())
                .map((t) => ({ vorne: t[0].trim(), hinten: t.slice(1).join(' ').trim() }))
            })
          }
        />
      )
    case 'reflexion':
      return (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Die Lernenden schätzen sich mit einer Ampel zu den Lernzielen der Reihe und der Schritte davor ein.
          </Text>
          <TextInput label="Frage fürs Lerntagebuch" value={i.frage} onChange={(e) => setzeInhalt({ frage: e.currentTarget.value })} />
        </Stack>
      )
    case 'praesenz':
      return (
        <Textarea
          label="Was im Unterricht passiert"
          autosize
          minRows={2}
          value={i.anweisung}
          onChange={(e) => setzeInhalt({ anweisung: e.currentTarget.value })}
        />
      )
    case 'diagnose':
      return (
        <Stack gap="xs">
          <Textarea
            label="Fragen (eine je Zeile: Frage | richtige Antwort | Auswahl1; Auswahl2 …)"
            description="Ohne Auswahl: kurze Antwort. Mehrere richtige Antworten mit „/“ trennen."
            autosize
            minRows={4}
            defaultValue={i.fragen.map((f) => [f.frage, f.richtig, f.optionen.join('; ')].filter(Boolean).join(' | ')).join('\n')}
            onChange={(e) =>
              setzeInhalt({
                fragen: e.currentTarget.value
                  .split('\n')
                  .map((z) => z.split('|').map((x) => x.trim()))
                  .filter((t) => t[0] && t[1])
                  .map((t) => ({
                    frage: t[0],
                    richtig: t[1],
                    optionen: (t[2] ?? '')
                      .split(';')
                      .map((x) => x.trim())
                      .filter(Boolean)
                  }))
              })
            }
          />
          <Group align="end">
            <NumberInput label="Bestanden ab (%)" min={1} max={100} value={i.schwelle} onChange={(v) => setzeInhalt({ schwelle: Number(v) || 80 })} w={160} />
            <NumberInput
              label="Erneut nach (Min.)"
              description="0 = nur einmal"
              min={0}
              max={10080}
              value={i.wiederholbarNachMin ?? 0}
              onChange={(v) => setzeInhalt({ wiederholbarNachMin: Number(v) || 0 })}
              w={150}
            />
            <MultiSelect
              style={{ flex: 1 }}
              label="Wer bestanden hat, überspringt"
              data={reihe.schritte.filter((x) => x.id !== s.id).map((x) => ({ value: x.id, label: x.titel || x.id }))}
              value={i.ueberspringen}
              onChange={(v) => setzeInhalt({ ueberspringen: v })}
            />
          </Group>
        </Stack>
      )
    case 'hefter':
      return (
        <Stack gap="xs">
          <Textarea
            label="Inhalt (Merkkasten, Regel, Tafelbild als Text)"
            autosize
            minRows={4}
            value={i.text}
            onChange={(e) => setzeInhalt({ text: e.currentTarget.value })}
          />
          <Select
            label="Erscheint im Hefter nach"
            clearable
            placeholder="sobald der Weg hier ankommt"
            data={reihe.schritte.filter((x) => x.id !== s.id).map((x) => ({ value: x.id, label: x.titel || x.id }))}
            value={s.nach ?? null}
            onChange={(v) => setze({ nach: v ?? undefined })}
          />
        </Stack>
      )
    case 'abschluss':
      return (
        <Stack gap="xs">
          <Textarea
            label="Auftrag für das Lernprodukt"
            autosize
            minRows={2}
            value={i.anweisung}
            onChange={(e) => setzeInhalt({ anweisung: e.currentTarget.value })}
          />
          <Textarea
            label="Bewertungsraster (ein Kriterium je Zeile)"
            autosize
            minRows={3}
            value={i.raster.join('\n')}
            onChange={(e) =>
              setzeInhalt({
                raster: e.currentTarget.value
                  .split('\n')
                  .map((x) => x.trim())
                  .filter(Boolean)
              })
            }
          />
          <Alert variant="light">Die Lernenden laden eine Datei oder ein Foto hoch; du bewertest in der Übersicht.</Alert>
        </Stack>
      )
    case 'vokabeln':
      return (
        <Stack gap="xs">
          <VokabelQuelle
            wahl={(a) => {
              if (!a) return
              setzeInhalt({ titel: a.titel, sprache: a.sprache, fach: a.fach, woerter: a.woerter })
              if (!s.titel) setze({ titel: a.titel })
              // Symbole zu greifbaren Wörtern im Hintergrund ergänzen
              void mitBildern(a).then((m) => setzeInhalt({ woerter: m.woerter }))
            }}
          />
          {i.woerter.length > 0 && (
            <Text size="sm" c="dimmed">
              {i.woerter.length} Wörter gewählt: {i.titel}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            Geschafft, wenn der eingestellte Anteil der Wörter eingeübt ist (mindestens Fach 2 im Karteikasten). Geübt wird in der Lern-App weiter, auch danach.
          </Text>
        </Stack>
      )
    case 'sprechen':
      return (
        <Stack gap="xs">
          <Textarea label="Sprechauftrag" autosize minRows={2} value={i.anweisung} onChange={(e) => setzeInhalt({ anweisung: e.currentTarget.value })} />
          <NumberInput label="Höchstens (Minuten)" min={1} max={10} value={i.minuten} onChange={(v) => setzeInhalt({ minuten: Number(v) || 2 })} w={180} />
          <Alert variant="light">Die Lernenden nehmen sich auf; du hörst die Aufnahme in der Übersicht und bewertest.</Alert>
        </Stack>
      )
  }
}
