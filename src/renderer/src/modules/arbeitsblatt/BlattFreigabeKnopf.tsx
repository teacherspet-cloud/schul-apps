/**
 * „Für Lernende freigeben" im Arbeitsblatt-Editor (Etappe 5, 02.10.2026; nur mit Server –
 * src/server/arbeitsblaetter.ts).
 *
 * Gezeichnet wird hier, auf dem Rechner der Lehrkraft, die SCHÜLERFASSUNG des gewählten Blattes
 * (dasselbe HTML wie Druck/PDF, ohne Lösungsteil). Lösungen und Erwartungen gehen getrennt an den
 * Server – nur für die KI, nie an die Lernenden. Dazu die verknüpfte Rückmeldung (Aufgaben +
 * Lösungsblatt als Erwartungshorizont), in der alle Abgaben landen.
 */
import { Alert, Badge, Button, Checkbox, Group, Modal, MultiSelect, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core'
import { IconQrcode, IconUsersGroup } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { BlattAufgabe } from '@shared/blattFreigabe'
import { aufServer } from '../../shared/plattform'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { Zugang } from '../onlinetest/OnlinetestModule'
import { STANDARD_ANREDE } from '../rueckmeldung/render/texte'
import type { Rueckmeldung } from '../rueckmeldung/model/types'
import { plainText } from '../../shared/richtext/parse'
import { describeBlock, describeSheet } from './generation/describe'
import type { Sheet, Worksheet } from './model/types'
import type { PagePlan } from './render/paginate'
import { buildWorksheetHtml } from './render/printHtml'
import { taskNumbersFor } from './render/SheetPages'

/** Aufgaben eines Blattes für den Server: Anweisung (wie gedruckt) und Erwartung samt Lösung */
export function blattAufgaben(sheet: Sheet): BlattAufgabe[] {
  const nummern = taskNumbersFor(sheet)
  return sheet.blocks.flatMap((b) => {
    if (b.type !== 'task') return []
    const nr = nummern.get(b.id) ?? 0
    const teile = b.parts.map((p, i) => `${String.fromCharCode(97 + i)}) ${plainText(p.instruction)}`)
    return [{ nr, anweisung: [plainText(b.instruction), ...teile].join(' '), erwartung: describeBlock(b) }]
  })
}

/** Merkkästen des Blattes (für die Karteikästen der Lern-App) */
/**
 * Lösungsblatt für Lernende (03.10.2026): ohne alles, was nur für die Lehrkraft ist – Hinweise mit
 * AFB/Operator/Begründung, Video-Notizen samt Rechtlichem, Lehrerseiten. Entfernt, nicht versteckt:
 * es soll gar nicht erst beim Schülergerät ankommen.
 */
export function loesungFuerLernende(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('.ws-teacher-page').forEach((e) => (e.closest('.ws-page') ?? e).remove())
  doc.querySelectorAll('.ws-teacher-note, .ws-video-note, .ws-teacher-hint').forEach((e) => e.remove())
  return `<!doctype html>${doc.documentElement.outerHTML}`
}

export function blattMerkkaesten(sheet: Sheet): { titel: string; text: string }[] {
  return sheet.blocks.flatMap((b) => (b.type === 'infoBox' && plainText(b.body).trim() ? [{ titel: b.title || 'Merkkasten', text: plainText(b.body) }] : []))
}

/** Verknüpfte Rückmeldung: Aufgaben als Aufgabenstellung, das ganze Blatt samt Lösungen als Erwartung */
export function blattRueckmeldung(ws: Worksheet, sheet: Sheet, titel: string): Rueckmeldung {
  const aufgaben = blattAufgaben(sheet)
  return {
    version: 1,
    meta: {
      title: titel,
      subjectId: ws.meta.subjectId,
      subjectLabel: ws.meta.subjectLabel,
      grade: ws.meta.grade,
      stateId: ws.meta.stateId,
      schoolTypeId: ws.meta.schoolTypeId,
      schoolTypeName: ws.meta.schoolTypeName,
      anrede: STANDARD_ANREDE,
      schwerpunkt: '',
      // Digitales Blatt: Fazit je Aufgabe, Randkommentare als Markierungen, Überarbeitungsauftrag (03.10.2026)
      digitalesBlatt: true,
      formen: ['schriftlich', 'tipps', 'rand', 'ueberarbeitung']
    },
    grundlage: {
      art: 'frei',
      titel,
      aufgaben: `Arbeitsblatt „${titel}“. Die Abgabe nennt die Einträge je Aufgabe.\n${aufgaben.map((a) => `Aufgabe ${a.nr}: ${a.anweisung}`).join('\n')}`,
      erwartung: describeSheet(sheet)
    },
    abgaben: [],
    createdAt: new Date().toISOString()
  } as Rueckmeldung
}

interface Freigegeben {
  id: string
  titel: string
  status: string
  lerngruppe: string
  schueler: number
  code?: string
  link?: string
  abgaben: number
  begonnen: number
}

export default function BlattFreigabeKnopf(props: {
  ws: Worksheet
  layouts: Map<string, PagePlan[]>
  logo: string | null
  schoolName: string
}): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  if (!aufServer()) return null
  return (
    <>
      <Button variant="light" leftSection={<IconUsersGroup size={16} />} onClick={() => setOffen(true)} data-blatt-freigeben-knopf>
        Für Lernende
      </Button>
      {offen && <Dialog {...props} schliessen={() => setOffen(false)} />}
    </>
  )
}

const Dialog = BlattFreigabeDialog

/**
 * Der Freigabe-Dialog – auch aus der App „Freigegebene Blätter“ heraus, mit einem gespeicherten Blatt
 * (03.10.2026). Ohne offene Seitenaufteilung (`layouts` leer) teilt der Druckweg selbst auf.
 */
export function BlattFreigabeDialog({
  ws,
  layouts,
  logo,
  schoolName,
  schliessen,
  ohneListe,
  freigegeben
}: {
  ws: Worksheet
  layouts: Map<string, PagePlan[]>
  logo: string | null
  schoolName: string
  schliessen: () => void
  /** Die Liste „Bisher freigegeben“ weglassen (die aufrufende Seite zeigt sie schon) */
  ohneListe?: boolean
  /** Nach jeder Freigabe */
  freigegeben?: () => void
}): React.JSX.Element {
  const [titel, setTitel] = useState(ws.meta.title || ws.meta.topic || 'Arbeitsblatt')
  const [blatt, setBlatt] = useState(ws.sheets[0]?.id ?? '')
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [mitglieder, setMitglieder] = useState<{ benutzer: string; name: string }[]>([])
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [gaeste, setGaeste] = useState(false)
  const [feedback, setFeedback] = useState(true)
  const [aufgabenFeedback, setAufgabenFeedback] = useState(true)
  const [runden, setRunden] = useState(2)
  const [stift, setStift] = useState(true)
  // Lösungsblatt nach dem ersten Einreichen (03.10.2026, Idee aus LearningView)
  const [loesungZeigen, setLoesungZeigen] = useState(true)
  // Schrittweise Freischaltung und Merkkästen am Ende (05.10.2026)
  const [schrittweise, setSchrittweise] = useState(false)
  const [merkAmEnde, setMerkAmEnde] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [liste, setListe] = useState<Freigegeben[]>([])
  const [qr, setQr] = useState<{ titel: string; code: string; link: string } | null>(null)
  const laden = (): void =>
    void holen<{ blaetter: Freigegeben[] }>('/server/blaetter').then(
      (d) => setListe(d.blaetter),
      () => setListe([])
    )
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(
      (d) => setGruppen(d.gruppen),
      () => setGruppen([])
    )
    laden()
  }, [])
  useEffect(() => {
    setEinzelne([])
    if (!gruppe) return setMitglieder([])
    void holen<{ mitglieder: { benutzer: string; name: string }[] }>(`/server/feedback/mitglieder?gruppe=${encodeURIComponent(gruppe)}`).then(
      (d) => setMitglieder(d.mitglieder),
      () => setMitglieder([])
    )
  }, [gruppe])
  const sheet = ws.sheets.find((s) => s.id === blatt) ?? ws.sheets[0]
  const aufgabenZahl = sheet ? sheet.blocks.filter((b) => b.type === 'task').length : 0

  const freigeben = async (): Promise<void> => {
    if (!sheet) return
    setLaeuft(true)
    try {
      // Schülerfassung: nur dieses Blatt, OHNE Lösungsteil
      const html = buildWorksheetHtml(ws, layouts, { sheetIds: [sheet.id], includeKey: false }, logo, schoolName)
      const loesung = loesungZeigen
        ? loesungFuerLernende(buildWorksheetHtml(ws, layouts, { sheetIds: [sheet.id], includeKey: false, keyOnly: true }, logo, schoolName))
        : ''
      const r = await senden<{ id: string; code?: string; link?: string }>('/server/blaetter/freigeben', {
        titel,
        html,
        aufgaben: blattAufgaben(sheet),
        rueckmeldung: blattRueckmeldung(ws, sheet, titel),
        fach: ws.meta.subjectLabel,
        thema: ws.meta.topic,
        merk: blattMerkkaesten(sheet),
        ...(loesung ? { loesung } : {}),
        lerngruppeId: gruppe ?? '',
        schueler: einzelne,
        gaeste,
        einstellungen: {
          feedback,
          // Schrittweise braucht das Urteil je Aufgabe
          aufgabenFeedback: schrittweise || (feedback && aufgabenFeedback),
          runden,
          aufgabenRunden: 2,
          stift,
          ...(schrittweise ? { schrittweise: true } : {}),
          ...(merkAmEnde ? { merkAmEnde: true } : {})
        }
      })
      notifySuccess('Freigegeben – die Lernenden finden das Blatt im Schülerbereich unter „Arbeitsblätter“.')
      if (r.code && r.link) setQr({ titel, code: r.code, link: r.link })
      laden()
      freigegeben?.()
      // Ohne QR-Code ist hier nichts mehr zu tun
      if (ohneListe && !(r.code && r.link)) schliessen()
    } catch (e) {
      notifyError(e, 'Nicht freigegeben')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Modal opened onClose={schliessen} title="Arbeitsblatt für Lernende freigeben" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Die Lernenden füllen das fertige Blatt am iPad oder PC direkt aus (tippen oder mit dem Stift), am Telefon als Liste. Lösungen bleiben auf dem Server.
          Alle Abgaben erscheinen in der Rückmeldungs-App unter „Lernende reichen selbst ein“.
        </Text>
        <TextInput label="Titel" value={titel} onChange={(e) => setTitel(e.currentTarget.value)} />
        {ws.sheets.length > 1 && (
          <Select
            label="Blatt"
            data={ws.sheets.map((s) => ({ value: s.id, label: s.label || s.id }))}
            value={blatt}
            onChange={(v) => v && setBlatt(v)}
            allowDeselect={false}
          />
        )}
        <Group align="end">
          <Select
            label="Lerngruppe"
            data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
            value={gruppe}
            onChange={setGruppe}
            clearable
            placeholder="wählen …"
            w={220}
          />
          {gruppe && (
            <MultiSelect
              style={{ flex: 1 }}
              label="Nur für einzelne Lernende"
              data={mitglieder.map((m) => ({ value: m.benutzer, label: m.name }))}
              value={einzelne}
              onChange={setEinzelne}
              searchable
              clearable
              placeholder="alle"
            />
          )}
        </Group>
        <Checkbox
          label="Auch Gäste per QR-Code und Namen (ohne Konto)"
          checked={gaeste}
          onChange={(e) => setGaeste(e.currentTarget.checked)}
          data-blatt-gaeste
        />
        <Checkbox
          label="KI-Feedback nach dem Einreichen (Bogen wie in der Rückmeldungs-App)"
          checked={feedback}
          onChange={(e) => setFeedback(e.currentTarget.checked)}
          data-blatt-feedback
        />
        {feedback && (
          <Group pl="lg" align="end">
            <Checkbox
              label="Zusätzlich kurzes Feedback je Aufgabe (ohne die Lösung zu verraten)"
              checked={aufgabenFeedback}
              onChange={(e) => setAufgabenFeedback(e.currentTarget.checked)}
            />
            <NumberInput label="Einreichungen je Person" min={1} max={5} value={runden} onChange={(v) => setRunden(Number(v) || 2)} w={170} />
          </Group>
        )}
        <Checkbox label="Stift erlauben (Handschriftliches geht als Bild an die KI)" checked={stift} onChange={(e) => setStift(e.currentTarget.checked)} />
        <Checkbox
          label="Aufgaben schrittweise freischalten"
          description="Die nächste Aufgabe erscheint erst, wenn die vorige mindestens teilweise treffend gelöst ist (KI-Feedback je Aufgabe oder Freischaltung durch die Lehrkraft). Links neben jeder Aufgabe steht eine Ampel."
          checked={schrittweise}
          onChange={(e) => setSchrittweise(e.currentTarget.checked)}
          data-blatt-schrittweise
        />
        {aufgabenZahl > 0 && sheet && sheet.blocks.some((b) => b.type === 'infoBox') && (
          <Checkbox
            label="Merkkästen erst nach vollständiger Bearbeitung zeigen"
            checked={merkAmEnde}
            onChange={(e) => setMerkAmEnde(e.currentTarget.checked)}
            data-blatt-merk-am-ende
          />
        )}
        <Checkbox
          label="Lösungsblatt nach dem ersten Einreichen zeigen"
          checked={loesungZeigen}
          onChange={(e) => setLoesungZeigen(e.currentTarget.checked)}
          data-blatt-loesung
        />
        {aufgabenZahl === 0 && <Alert color="orange">Dieses Blatt hat keine Aufgaben zum Ausfüllen.</Alert>}
        <Group justify="flex-end">
          <Button loading={laeuft} disabled={(!gruppe && !gaeste) || !aufgabenZahl || !titel.trim()} onClick={() => void freigeben()} data-blatt-freigeben>
            Freigeben
          </Button>
        </Group>
        {!ohneListe && liste.length > 0 && (
          <Stack gap={6} mt="sm">
            <Text fw={600} size="sm">
              Bisher freigegeben
            </Text>
            {liste.map((f) => (
              <Group key={f.id} justify="space-between" wrap="nowrap">
                <div>
                  <Text size="sm" fw={600}>
                    {f.titel}{' '}
                    {f.status !== 'offen' && (
                      <Badge size="xs" color="gray">
                        beendet
                      </Badge>
                    )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {[
                      f.lerngruppe && (f.schueler ? `${f.lerngruppe} (${f.schueler} ausgewählt)` : f.lerngruppe),
                      f.code && 'Gäste per QR',
                      `${f.begonnen} begonnen`,
                      `${f.abgaben} eingereicht`
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </div>
                <Group gap={4} wrap="nowrap">
                  {f.code && f.link && (
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={<IconQrcode size={14} />}
                      onClick={() => setQr({ titel: f.titel, code: f.code!, link: f.link! })}
                    >
                      QR-Code
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={() =>
                      void senden(`/server/blaetter/${f.id}/status`, { status: f.status === 'offen' ? 'beendet' : 'offen' }).then(laden, (e: unknown) =>
                        notifyError(e)
                      )
                    }
                  >
                    {f.status === 'offen' ? 'Beenden' : 'Wieder öffnen'}
                  </Button>
                </Group>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
      {qr && (
        <Modal opened onClose={() => (setQr(null), ohneListe && schliessen())} title={qr.titel} size="lg">
          <Zugang code={qr.code} link={qr.link} />
        </Modal>
      )}
    </Modal>
  )
}
