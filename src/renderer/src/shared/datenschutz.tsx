/**
 * Datenschutzhinweis vor dem Hochladen an eine KI (Großprogramm 0.4, Rechtspaket).
 *
 * Beim ersten Hochladen erklärt die App, was an welchen Anbieter geht und was nicht dorthin
 * gehört. Bei jedem Hochladen zeigt sie gefundene Namen und ersetzt die gewählten durch S1, S2 …
 * (shared/pseudonymisierung.ts). Findet sie nichts und ist der Hinweis bestätigt, erscheint
 * gar nichts – der Dialog soll nicht zur Klickstrecke werden.
 *
 * Aufruf: `const ok = await pruefeHochladen(inhalte)` – null heißt abgebrochen.
 */
import { Alert, Button, Checkbox, Group, List, Modal, Stack, Text } from '@mantine/core'
import { IconShieldLock } from '@tabler/icons-react'
import { useState } from 'react'
import { create } from 'zustand'
import { aktuelleKi } from '@shared/kiKennzeichnung'
import { ersetzeNamen, findeNamen, type NamensFund, type Zuordnung } from '@shared/pseudonymisierung'
import { useAppSettings } from './settingsStore'

export interface HochladeInhalt {
  fileName: string
  text: string
  kind: string
  pageImages?: string[]
  /** Kürzel → Name, falls ersetzt wurde (bleibt auf diesem Rechner) */
  pseudonyme?: Zuordnung[]
}

interface Frage {
  inhalte: HochladeInhalt[]
  funde: NamensFund[]
  erstmals: boolean
  bilder: boolean
  antworte: (namen: string[] | null) => void
}

const useFrage = create<{ frage: Frage | null; setze: (f: Frage | null) => void }>((set) => ({ frage: null, setze: (frage) => set({ frage }) }))

/** Nur Textarten werden durchsucht; Bilder haben keinen Text */
const durchsuchbar = (i: HochladeInhalt): boolean => i.kind !== 'image' && Boolean(i.text?.trim())

export async function pruefeHochladen<T extends HochladeInhalt>(inhalte: T[]): Promise<T[] | null> {
  const { settings, update } = useAppSettings.getState()
  const erstmals = !settings.datenschutz?.hinweisBestaetigt
  const alle = new Map<string, NamensFund>()
  for (const i of inhalte.filter(durchsuchbar))
    for (const f of findeNamen(i.text)) {
      const da = alle.get(f.name)
      alle.set(f.name, da ? { ...da, anzahl: da.anzahl + f.anzahl, herkunft: da.herkunft === 'kopf' ? 'kopf' : f.herkunft } : f)
    }
  const funde = [...alle.values()]
  const bilder = inhalte.some((i) => i.kind === 'image' || (i.pageImages?.length ?? 0) > 0)
  if (!erstmals && !funde.length) return inhalte
  const namen = await new Promise<string[] | null>((resolve) => useFrage.getState().setze({ inhalte, funde, erstmals, bilder, antworte: resolve }))
  useFrage.getState().setze(null)
  if (namen === null) return null
  if (erstmals) void update({ datenschutz: { ...settings.datenschutz, hinweisBestaetigt: new Date().toISOString() } })
  if (!namen.length) return inhalte
  // Ein gemeinsames Kürzelverzeichnis über alle Dateien dieses Hochladens
  let zuordnung: Zuordnung[] = []
  return inhalte.map((i) => {
    if (!durchsuchbar(i)) return i
    const r = ersetzeNamen(i.text, namen, zuordnung)
    zuordnung = r.zuordnung
    return { ...i, text: r.text, pseudonyme: r.zuordnung.filter((z) => namen.includes(z.name)) }
  })
}

/** Einmal im Hauptfenster eingebunden (App.tsx) */
export function DatenschutzDialog(): React.JSX.Element | null {
  const frage = useFrage((s) => s.frage)
  const settings = useAppSettings((s) => s.settings)
  if (!frage) return null
  return (
    <DialogInhalt
      key={frage.inhalte.map((i) => i.fileName).join('|')}
      frage={frage}
      vorbelegen={settings.datenschutz?.namenErsetzen !== false}
      anbieter={aktuelleKi(settings).anbieter}
    />
  )
}

function DialogInhalt({ frage, vorbelegen, anbieter }: { frage: Frage; vorbelegen: boolean; anbieter: string }): React.JSX.Element {
  const [gewaehlt, setGewaehlt] = useState<string[]>(() => (vorbelegen ? frage.funde.filter((f) => f.herkunft === 'kopf').map((f) => f.name) : []))
  return (
    <Modal opened onClose={() => frage.antworte(null)} title="Vor dem Hochladen" size="lg" centered>
      <Stack gap="md">
        {frage.erstmals && (
          <Alert icon={<IconShieldLock size={18} />} color="blue" variant="light" title="Was mit hochgeladenen Dateien geschieht">
            <List size="sm" spacing={4}>
              <List.Item>Der Inhalt geht zur Auswertung an die eingestellte KI ({anbieter}). Die App selbst speichert nur auf diesem Rechner.</List.Item>
              <List.Item>
                Personenbezogene Daten von Schülerinnen und Schülern – Namen, Noten, Gesundheits- oder Familienangaben – gehören nicht dorthin. Die meisten
                Länder erlauben das mit privaten Werkzeugen nicht.
              </List.Item>
              <List.Item>Namen in Texten schlägt die App zum Ersetzen vor. In Fotos und Scans findet sie keine Namen – bitte vorher schwärzen.</List.Item>
              <List.Item>Fotos gehen ohne Standort- und Kameradaten (EXIF) hinaus.</List.Item>
            </List>
          </Alert>
        )}
        {frage.funde.length > 0 ? (
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Gefundene Namen – angekreuzte werden durch S1, S2 … ersetzt:
            </Text>
            <Text size="xs" c="dimmed">
              Namen aus Kopfzeilen („Name: …") sind vorbelegt. Namen im Text können gewollt sein (Personen einer Quelle, Figuren einer Lektüre).
            </Text>
            {frage.funde.map((f) => (
              <Checkbox
                key={f.name}
                size="sm"
                label={`${f.name}${f.herkunft === 'kopf' ? ' (Kopfzeile)' : ''} – ${f.anzahl}×`}
                checked={gewaehlt.includes(f.name)}
                onChange={(e) => setGewaehlt((g) => (e.currentTarget.checked ? [...g, f.name] : g.filter((x) => x !== f.name)))}
              />
            ))}
          </Stack>
        ) : (
          <Text size="sm">In den Texten wurden keine Namen gefunden.</Text>
        )}
        {frage.bilder && (
          <Text size="xs" c="dimmed">
            Dabei sind Bilder oder gescannte Seiten. Namen und Gesichter darauf erkennt die App nicht.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => frage.antworte(null)}>
            Abbrechen
          </Button>
          <Button onClick={() => frage.antworte(gewaehlt)} data-datenschutz-ok>
            {gewaehlt.length ? `${gewaehlt.length} ersetzen und hochladen` : 'Hochladen'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
