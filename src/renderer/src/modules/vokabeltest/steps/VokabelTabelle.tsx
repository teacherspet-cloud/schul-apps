import {
  istGanzerSatz,
  satzSchluessel,
  sprachKurz,
  STIMMLAGE_NAME,
  tonVon,
  type Bildstufe,
  type MedienSicht,
  type Stimmen,
  type Stimmlage,
  type TonArt
} from '@shared/medienbank'
import { bildVon } from '@shared/medienBedeutung'
import { BildDialog, BildZelle, satzTonVon, TonZelle, useNurVerdacht, useTonNachpruefung, zeileMitVerdacht } from '../../../shared/medien/MedienUi'
import { gesprochenFuer, lagenVon, starteMedienAuftrag, type MedienZiel } from '../../../shared/medien/medienAuftrag'
import { satzFuerLage, type SatzFassung } from '@shared/satzFassung'
import { notifyError } from '../../../shared/util'
import { abkuerzungAus, abkVoll } from '@shared/abkuerzung'
import { ActionIcon, Badge, Box, Button, Checkbox, Group, Menu, Stack, Table, Text, Textarea, TextInput, Tooltip } from '@mantine/core'
import { IconArrowsExchange, IconDots, IconPlus, IconTrash } from '@tabler/icons-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { newId } from '../model/random'
import SonderzeichenLeiste from '../../../shared/components/SonderzeichenLeiste'
import { sprachAttribute } from '../../../shared/sprachSchrift'

/**
 * EINE Vokabeltabelle für Vokabeltest (Schritt 1 und Prüffenster), eigene Listen und
 * Schulbuch-Abschnitte.
 *
 * Anlass (Paket 7): Es gab drei Tabellen mit verschiedenem Verhalten – im Vokabeltest legte
 * Enter/Tab in der letzten Zelle eine Zeile an, in den Listen erschien von selbst eine leere
 * Zeile; Löschknöpfe hatten mal einen Namen, mal nicht; „grau" und „Kasten" waren zwei
 * Häkchenspalten, die man leicht mit „abfragen" verwechselte. Jetzt überall gleich:
 *
 * - Enter springt in die nächste Zeile; in der letzten Zeile legen Enter und Tab (im letzten
 *   Feld) eine neue an.
 * - „abfragen" ist die einzige Häkchenspalte (nur im Vokabeltest).
 * - Zusatzwortschatz (im Buch grau) und Kasten-Wörter sind als Kennzeichen in der Zeile
 *   sichtbar (grauer Text, kleines Schild) und über das ⋯-Menü der Zeile umzuschalten.
 * - Jeder Knopf und jedes Feld hat einen Namen für Bildschirmleser.
 */

/** Was eine Zeile mindestens hat – Vokabeltest-Einträge und Listen-/Schulbuchzeilen passen beide */
export interface TabellenZeile {
  id: string
  term: string
  translation: string
  pos?: string
  note?: string
  /** Beispielsatz aus dem Schulbuch und seine Übersetzung (nur in Schulbuch-Abschnitten) */
  example?: string
  exampleTranslation?: string
  /** Zusatzwortschatz – im Buch grau gedruckt */
  grey?: boolean
  inBox?: boolean
  /** Wird im Test abgefragt (fehlt = ja) – nur mit `abfragen` */
  include?: boolean
  /** Sprechtext für die Sprachausgabe statt des Wortes („Aussprache als …", 09.10.2026) */
  aussprache?: string
  /** Weitere richtige Antworten („auch richtig", 09.10.2026) */
  auchRichtig?: string[]
}

type Feld = 'term' | 'translation' | 'pos' | 'example' | 'note'

export const ZUSATZ = 'Zusatzwortschatz (im Buch grau)'

export const leereZeile = <T extends TabellenZeile>(): T => ({ id: newId(), term: '', translation: '' } as T)

/**
 * Beispielsatz einer Zeile für die Satz-Aussprache (12.10.2026): in Schulbüchern das eigene Feld, in Listen der Hinweis,
 * wenn er ein ganzer Satz ist (vorher zählte die Medienleiste der Listen nie einen Satz).
 */
export const satzDerZeile = (z: Pick<TabellenZeile, 'example' | 'note'>, mitBeispiel: boolean): string | undefined =>
  mitBeispiel ? z.example : istGanzerSatz(z.note) ? z.note : undefined

const KEINE_MEDIEN: Record<string, MedienSicht> = {}

/**
 * Sprache der Tabelle (30.09.2026): Schrift, Schreibrichtung und Sonderzeichen der Wortspalte,
 * Beispiel im Platzhalter und die Überschrift der dritten Spalte – in Latein/Griechisch steht dort
 * die Nennform, in Chinesisch/Japanisch die Lesung (so drucken es die Lehrwerke).
 */
const BEISPIEL: Record<string, string> = {
  en: 'z. B. to explore',
  fr: 'z. B. découvrir',
  es: 'z. B. descubrir',
  it: 'z. B. scoprire',
  nl: 'z. B. ontdekken',
  ru: 'z. B. открывать',
  pl: 'z. B. odkrywać',
  cs: 'z. B. objevovat',
  pt: 'z. B. descobrir',
  tr: 'z. B. keşfetmek',
  zh: 'z. B. 发现',
  ja: 'z. B. 発見する',
  ar: 'z. B. اِكتَشَفَ',
  da: 'z. B. at opdage',
  el: 'z. B. ανακαλύπτω',
  la: 'z. B. invenire',
  grc: 'z. B. ὁ λόγος'
}
const DRITTE_SPALTE: Record<string, string> = {
  la: 'Nennform / Wortart',
  grc: 'Nennform / Wortart',
  zh: 'Pinyin / Wortart',
  ja: 'Lesung / Wortart'
}

export default function VokabelTabelle<T extends TabellenZeile>({
  zeilen,
  onChange,
  abfragen = false,
  mitBeispiel = false,
  mitVerlauf = false,
  bereinige,
  sprache,
  nurLesen = false,
  medien
}: {
  zeilen: T[]
  /** Neue Zeilen; `gruppe` fasst fortlaufendes Tippen im selben Feld zu EINEM Verlaufsschritt */
  onChange: (zeilen: T[], gruppe?: string) => void
  /** Spalte „abfragen" (Vokabeltest) */
  abfragen?: boolean
  /** Spalte „Beispielsatz" mit Übersetzung (Schulbuch-Abschnitte) */
  mitBeispiel?: boolean
  /** Holt Strg+Z eine gelöschte Zeile zurück? (Nur dann sagt es der Tooltip) */
  mitVerlauf?: boolean
  /** Zusätzliche Änderungen zu einer Änderung, z. B. veraltete Bild-Analyse verwerfen */
  bereinige?: (zeile: T, patch: Partial<T>) => Partial<T>
  /** Sprachcode der Wörter (Schrift, Sonderzeichen, Spaltennamen) – fehlt = ohne Besonderheiten */
  sprache?: string
  /** Nur ansehen (gemeinsames Lehrwerk für Lehrkräfte, 05.10.2026) */
  nurLesen?: boolean
  /** Medienbank: Spalten Beispielbild, Aussprache, Satz-Aussprache (05.10.2026, shared/medien) */
  medien?: { sprache: string; daten: Record<string, MedienSicht>; admin: boolean; neuLaden: () => void; ziel?: MedienZiel }
}): React.JSX.Element {
  // Stabile Rückrufe: Sonst zeichnet die Tabelle (oft weit über hundert Zeilen) bei jedem
  // Tastendruck ALLE Zeilen neu, und das Tippen wird spürbar zäh.
  const aktuell = useRef({ zeilen, onChange, bereinige })
  aktuell.current = { zeilen, onChange, bereinige }
  const [fokus, setFokus] = useState<{ id: string; feld: Feld } | null>(null)
  const tabelle = useRef<HTMLTableElement>(null)
  // Medienbank: offenes Bild-Pop-up und Standardstimme der Sprache (für einzelne Aussprachen)
  const [bildOffen, setBildOffen] = useState<TabellenZeile | null>(null)
  // Standardstimmen der Sprache: weibliche und männliche Fassung (07.10.2026)
  const [stimmen, setStimmen] = useState<Stimmen>({})
  const medienSprache = medien ? sprachKurz(medien.sprache) : ''
  const medienAdmin = Boolean(medien?.admin)
  const neuLaden = medien?.neuLaden
  // Stelle der Tabelle für die Auftragsleiste („Öffnen" führt dorthin) – ohne Angabe die Vokabellisten allgemein
  const ziel: MedienZiel = medien?.ziel ?? { docId: 'vokabeln', titel: 'Vokabeln' }
  const zielRef = useRef(ziel)
  zielRef.current = ziel
  useEffect(() => {
    if (medienAdmin && medienSprache)
      void window.api.medien.stimmen().then(
        (s) => setStimmen(s[medienSprache] ?? {}),
        () => setStimmen({})
      )
  }, [medienAdmin, medienSprache])
  /*
   * Einzelne Aussprache (06.10.2026): als Auftrag in der Auftragsleiste – mit Warten bei ausgelasteter Sprach-KI.
   * Die Zelle dreht, bis er fertig ist; Fehler meldet der Auftrag selbst.
   */
  const tonErzeugenFuer = useCallback(
    async (wort: string, art: TonArt, text: string, lage: Stimmlage = 'w'): Promise<void> => {
      if (!stimmen[lage]) throw new Error('Für diese Sprache ist keine Standardstimme eingestellt (Einstellungen › Bilder und Hörtexte).')
      const zeile = aktuell.current.zeilen.find((z) => z.term === wort)
      await starteMedienAuftrag({
        art: art === 'wort' ? 'aussprache' : 'satz',
        sprache: medienSprache,
        vokabeln: [
          {
            term: wort,
            translation: zeile?.translation ?? '',
            example: art === 'satz' ? text : zeile?.example,
            exampleTranslation: zeile?.exampleTranslation,
            aussprache: zeile?.aussprache
          }
        ],
        ziel: zielRef.current,
        lagen: [lage],
        einzeln: true
      })
      neuLaden?.()
    },
    [stimmen, medienSprache, neuLaden]
  )
  /*
   * „Neue Aussprache erzeugen" der Admins (12.10.2026, Rechtsklick bzw. langer Druck auf das Symbol): sofort über den
   * Auftragsweg, auch wenn die Aufnahme passt; die bisherige bleibt als Rückfall. Satz: das Original – der Auftrag
   * nimmt für jede Stimme ihre Fassung.
   */
  const neuErzeugenFuer = useCallback(
    async (wort: string, art: TonArt, satz: string | undefined, lagen: Stimmlage[], grund: string): Promise<void> => {
      const zeile = aktuell.current.zeilen.find((z) => z.term === wort)
      await starteMedienAuftrag({
        art: art === 'wort' ? 'aussprache' : 'satz',
        sprache: medienSprache,
        vokabeln: [
          { term: wort, translation: zeile?.translation ?? '', example: satz, exampleTranslation: zeile?.exampleTranslation, aussprache: zeile?.aussprache }
        ],
        ziel: zielRef.current,
        lagen,
        einzeln: true,
        neu: { grund }
      })
      neuLaden?.()
    },
    [medienSprache, neuLaden]
  )
  /** Fassung eines geschlechtsbezogenen Beispielsatzes speichern (12.10.2026); null = vergessen */
  const fassungSpeichern = useCallback(
    async (wort: string, original: string, f: Partial<SatzFassung> | null): Promise<void> => {
      await window.api.medien.fassungSetzen(medienSprache, wort, original, f)
      neuLaden?.()
    },
    [medienSprache, neuLaden]
  )
  // Nachprüfung vorhandener Aufnahmen per Messung (12.10.2026) – gedrosselt im Hintergrund, Admins speichern das Ergebnis
  useTonNachpruefung(medien ? medienSprache : undefined, medien?.daten ?? KEINE_MEDIEN, medienAdmin)
  // Filter „vielleicht undeutlich" der Medienleiste (12.10.2026)
  const nurVerdacht = useNurVerdacht(medien?.ziel?.docId)

  useEffect(() => {
    if (!fokus) return
    tabelle.current?.querySelector<HTMLInputElement>(`[data-zeile="${fokus.id}"][data-feld="${fokus.feld}"]`)?.focus()
    setFokus(null)
  }, [fokus, zeilen])

  const aendern = useCallback((id: string, teil: Partial<TabellenZeile>, gruppe?: string): void => {
    const { zeilen: z, onChange: fertig, bereinige: b } = aktuell.current
    const patch = teil as Partial<T>
    fertig(
      z.map((x) => (x.id === id ? { ...x, ...patch, ...(b ? b(x, patch) : {}) } : x)),
      gruppe
    )
  }, [])

  const neueZeile = useCallback((nach?: string): void => {
    const { zeilen: z, onChange: fertig } = aktuell.current
    const neu = leereZeile<T>()
    const i = nach ? z.findIndex((x) => x.id === nach) : -1
    fertig(i < 0 ? [...z, neu] : [...z.slice(0, i + 1), neu, ...z.slice(i + 1)])
    setFokus({ id: neu.id, feld: 'term' })
  }, [])

  const loeschen = useCallback((id: string): void => {
    const { zeilen: z, onChange: fertig } = aktuell.current
    fertig(z.filter((x) => x.id !== id))
  }, [])

  /** Enter: nächste Zeile (gleiches Feld); in der letzten Zeile eine neue anlegen */
  const weiter = useCallback(
    (id: string, feld: Feld): void => {
      const z = aktuell.current.zeilen
      const i = z.findIndex((x) => x.id === id)
      if (i === z.length - 1) neueZeile()
      else if (i >= 0) setFokus({ id: z[i + 1].id, feld })
    },
    [neueZeile]
  )

  const gefuellt = zeilen.filter((v) => v.term.trim())
  const abgefragt = gefuellt.filter((v) => v.include !== false).length

  // Leserecht (23.10.2026, Wunsch der Lehrkraft): nur ausgefüllte Zeilen, ohne Eingabehilfen; leer ein Satz statt einer leeren Zeile
  const gezeigt = nurLesen ? zeilen.filter((z) => z.term.trim() || z.translation.trim()) : zeilen
  if (nurLesen && !gezeigt.length)
    return (
      <Text size="sm" c="dimmed" py="sm" data-vokabeln-leer>
        In diesem Abschnitt stehen noch keine Vokabeln.
      </Text>
    )
  return (
    <>
      {!nurLesen && <SonderzeichenLeiste sprache={sprache} />}
      <Box style={{ overflowX: 'auto' }}>
        <Table verticalSpacing={4} striped highlightOnHover ref={tabelle} className="vokabel-tabelle">
          <Table.Thead>
            <Table.Tr>
              {abfragen && (
                <Table.Th w={44}>
                  <Tooltip label="Alle abfragen / keine abfragen">
                    <Checkbox
                      aria-label="Alle Vokabeln abfragen"
                      checked={gefuellt.length > 0 && abgefragt === gefuellt.length}
                      indeterminate={abgefragt > 0 && abgefragt < gefuellt.length}
                      onChange={(e) => {
                        const an = e.currentTarget.checked
                        onChange(zeilen.map((v) => ({ ...v, include: an })))
                      }}
                    />
                  </Tooltip>
                </Table.Th>
              )}
              <Table.Th w={36}>#</Table.Th>
              <Table.Th>Wort / Ausdruck</Table.Th>
              <Table.Th>{sprache === 'de' ? 'Bedeutung' : 'Deutsch'}</Table.Th>
              <Table.Th w={sprache && DRITTE_SPALTE[sprache] ? 160 : 110}>{(sprache && DRITTE_SPALTE[sprache]) || 'Wortart'}</Table.Th>
              {mitBeispiel && (
                <Table.Th miw={200}>
                  <Tooltip label="Beispielsatz aus dem Schulbuch, darunter seine Übersetzung" withArrow>
                    <span>Beispielsatz</span>
                  </Tooltip>
                </Table.Th>
              )}
              <Table.Th>{mitBeispiel ? 'Hinweis' : 'Beispiel / Hinweis'}</Table.Th>
              {medien && (
                <>
                  <Table.Th w={64}>Beispielbild</Table.Th>
                  <Table.Th w={72}>Aussprache</Table.Th>
                  <Table.Th w={72}>Satz-Aussprache</Table.Th>
                </>
              )}
              {!nurLesen && <Table.Th w={72} />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {gezeigt.map((z, i) =>
              nurVerdacht && medien && !zeileMitVerdacht(medien.daten[z.term], satzDerZeile(z, mitBeispiel)) ? null : (
                <Zeile
                  key={z.id}
                  zeile={z}
                  nr={i + 1}
                  letzte={i === gezeigt.length - 1}
                  abfragen={abfragen}
                  mitBeispiel={mitBeispiel}
                  mitVerlauf={mitVerlauf}
                  aendern={aendern}
                  loeschen={loeschen}
                  weiter={weiter}
                  neueZeile={neueZeile}
                  sprache={sprache}
                  nurLesen={nurLesen}
                  medienAn={Boolean(medien)}
                  bildStufe={medien?.ziel?.stufe}
                  sicht={medien?.daten[z.term]}
                  medienAdmin={medienAdmin}
                  bildOeffnen={setBildOffen}
                  tonErzeugen={tonErzeugenFuer}
                  lagen={lagenVon(stimmen).join(',')}
                  neuErzeugen={neuErzeugenFuer}
                  fassungSpeichern={fassungSpeichern}
                />
              )
            )}
          </Table.Tbody>
        </Table>
      </Box>
      {!nurLesen && (
        <Button variant="subtle" leftSection={<IconPlus size={16} />} mt="xs" onClick={() => neueZeile()}>
          Zeile hinzufügen
        </Button>
      )}
      {medien && bildOffen && (
        <BildDialog
          sprache={medienSprache}
          v={{ term: bildOffen.term, translation: bildOffen.translation, example: bildOffen.example, ...(bildOffen.pos ? { pos: bildOffen.pos } : {}) }}
          sicht={bildVon(medien.daten[bildOffen.term], bildOffen, medienSprache)}
          admin={medienAdmin}
          ziel={ziel}
          schliessen={() => setBildOffen(null)}
          geaendert={() => medien.neuLaden()}
        />
      )}
    </>
  )
}

interface ZeilenProps {
  zeile: TabellenZeile
  nr: number
  letzte: boolean
  abfragen: boolean
  mitBeispiel: boolean
  mitVerlauf: boolean
  aendern: (id: string, patch: Partial<TabellenZeile>, gruppe?: string) => void
  loeschen: (id: string) => void
  weiter: (id: string, feld: Feld) => void
  neueZeile: (nach?: string) => void
  sprache?: string
  nurLesen: boolean
  /** Spalten der Medienbank zeigen – einzelne Werte statt eines Objekts, damit `memo` greift */
  medienAn: boolean
  /** Bildstufe der Ansicht (07.10.2026) */
  bildStufe?: Bildstufe
  sicht?: MedienSicht
  medienAdmin: boolean
  bildOeffnen: (z: TabellenZeile) => void
  tonErzeugen: (wort: string, art: TonArt, text: string, lage?: Stimmlage) => Promise<void>
  /** Fassungen mit Standardstimme (weiblich/männlich) – eine Zelle je Fassung */
  lagen: string
  /** „Neue Aussprache erzeugen" (12.10.2026, nur Admins) */
  neuErzeugen: (wort: string, art: TonArt, satz: string | undefined, lagen: Stimmlage[], grund: string) => Promise<void>
  /** Fassung eines geschlechtsbezogenen Beispielsatzes speichern (12.10.2026) */
  fassungSpeichern: (wort: string, original: string, f: Partial<SatzFassung> | null) => Promise<void>
}

/**
 * Angepasste Fassung eines geschlechtsbezogenen Beispielsatzes (12.10.2026, shared/satzFassung.ts): unter dem Original,
 * mit Übersetzung. Admins bearbeiten sie (gespeichert beim Verlassen des Feldes), tauschen die Stimme oder verwerfen sie
 * („keine Anpassung" – die KI schlägt sie dann nicht erneut vor).
 */
function FassungFeld({
  f,
  admin,
  speichern,
  sprache
}: {
  f: SatzFassung
  admin: boolean
  speichern: (f: Partial<SatzFassung> | null) => Promise<void>
  sprache?: string
}): React.JSX.Element | null {
  const [text, setText] = useState(f.text ?? '')
  const [ueb, setUeb] = useState(f.uebersetzung ?? '')
  useEffect(() => {
    setText(f.text ?? '')
    setUeb(f.uebersetzung ?? '')
  }, [f.text, f.uebersetzung])
  if (!f.lage) return null
  const lage = f.lage
  const sichern = (patch: Partial<SatzFassung>): void =>
    void speichern({ lage, text, uebersetzung: ueb, von: 'hand', ...patch }).catch((e: unknown) => notifyError(e, 'Fassung nicht gespeichert'))
  const attr = sprachAttribute(sprache)
  return (
    <Box
      mt={4}
      px={6}
      py={2}
      style={{ borderLeft: '3px solid var(--mantine-color-grape-5)', background: 'var(--mantine-color-grape-light)', borderRadius: 4 }}
      data-satz-fassung={lage}
    >
      <Group gap={4} justify="space-between" wrap="nowrap">
        <Tooltip
          label="Der Satz legt die sprechende Person auf ein Geschlecht fest – diese Stimme spricht (und Lernende mit ihr sehen) die angepasste Fassung. Tests und Arbeitsblätter behalten das Original."
          multiline
          maw={320}
        >
          <Text size="10px" fw={600} c="grape.8">
            Fassung für {STIMMLAGE_NAME[lage]}e Stimme{f.von === 'ki' ? ' (KI-Vorschlag)' : ''}
          </Text>
        </Tooltip>
        {admin && (
          <Group gap={0} wrap="nowrap">
            <Tooltip label={`Stattdessen für die ${STIMMLAGE_NAME[lage === 'w' ? 'm' : 'w']}e Stimme`}>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="grape"
                aria-label="Fassung der anderen Stimme zuordnen"
                onClick={() => sichern({ lage: lage === 'w' ? 'm' : 'w' })}
              >
                <IconArrowsExchange size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Keine Anpassung – beide Stimmen sprechen das Original">
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                aria-label="Fassung verwerfen"
                onClick={() => void speichern({ von: 'hand' }).catch((e: unknown) => notifyError(e, 'Fassung nicht gespeichert'))}
                data-satz-fassung-weg
              >
                <IconTrash size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
      <Textarea
        variant="unstyled"
        size="xs"
        autosize
        minRows={1}
        readOnly={!admin}
        value={text}
        lang={attr.lang}
        dir={attr.dir}
        aria-label={`Fassung für ${STIMMLAGE_NAME[lage]}e Stimme`}
        styles={{ input: { ...UMBRUCH, paddingTop: 2, paddingBottom: 2, ...(attr.style ?? {}) } }}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={() => text.trim() && text !== (f.text ?? '') && sichern({ text: text.trim() })}
        data-satz-fassung-text
      />
      <Textarea
        variant="unstyled"
        size="xs"
        autosize
        minRows={1}
        readOnly={!admin}
        value={ueb}
        placeholder="Übersetzung der Fassung"
        aria-label="Übersetzung der Fassung"
        styles={{ input: { ...UMBRUCH, paddingTop: 2, paddingBottom: 2, color: 'var(--mantine-color-dimmed)' } }}
        onChange={(e) => setUeb(e.currentTarget.value)}
        onBlur={() => ueb !== (f.uebersetzung ?? '') && sichern({ uebersetzung: ueb.trim() })}
      />
    </Box>
  )
}

/** Mitwachsende Felder: eng wie eine Eingabezeile, ohne Ziehgriff, Umbruch auch in langen Wörtern */
const UMBRUCH: React.CSSProperties = {
  resize: 'none',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  paddingTop: 6,
  paddingBottom: 6,
  lineHeight: 1.35,
  minHeight: 0
}

const Zeile = memo(function Zeile({
  zeile: v,
  nr,
  letzte,
  abfragen,
  mitBeispiel,
  mitVerlauf,
  aendern,
  loeschen,
  weiter,
  neueZeile,
  sprache,
  nurLesen,
  medienAn,
  bildStufe,
  sicht,
  medienAdmin,
  bildOeffnen,
  tonErzeugen: tonFuer,
  lagen: lagenText,
  neuErzeugen: neuFuer,
  fassungSpeichern
}: ZeilenProps): React.JSX.Element {
  // Fassungen der Aussprache (07.10.2026): ohne eingestellte Stimme eine Zelle wie bisher (weiblich = bisherige Felder)
  const lagen: Stimmlage[] = lagenText ? (lagenText.split(',') as Stimmlage[]) : ['w']
  const zwei = lagen.length > 1
  const name = v.term.trim() || `Zeile ${nr}`
  /*
   * „Aussprache als …" und „auch richtig" (09.10.2026, Abkürzungen): zwei kleine Felder unter dem Wort – sichtbar, sobald
   * etwas eingetragen ist, sonst über das ⋯-Menü. Erkennt die App eine Abkürzung, steht sie als Hinweis darunter.
   */
  const [zusatzOffen, setZusatzOffen] = useState(false)
  const zusatz = zusatzOffen || Boolean(v.aussprache) || Boolean(v.auchRichtig?.length)
  const abk = useMemo(() => abkuerzungAus(v.term), [v.term])
  const sprechtext = medienAn ? gesprochenFuer('wort', v.term, v, sprache ?? 'en') : undefined
  const abgefragt = v.include !== false
  // Beispielsatz für die Satz-Aussprache und seine angepasste Fassung (geschlechtsbezogene Sätze, 12.10.2026)
  const satz = satzDerZeile(v, mitBeispiel)
  const fassungDa = satz ? (sicht?.fassungen?.[satzSchluessel(satz)] as SatzFassung | undefined) : undefined
  const fassungFeld =
    medienAn && satz && fassungDa?.lage ? (
      <FassungFeld f={fassungDa} admin={medienAdmin} sprache={sprache} speichern={(f) => fassungSpeichern(v.term, satz, f)} />
    ) : null
  // Wort, Beispiel und Nennform/Lesung in der Schrift der Sprache; Deutsch und Hinweis bleiben, wie sie sind
  const zielsprachig = (f: Feld): boolean => f === 'term' || f === 'example' || f === 'pos'
  /*
   * Zeilenumbruch statt Abschneiden (06.10.2026, Wunsch der Lehrkraft): Lange Beispielsätze, Hinweise und Wendungen
   * waren in den festen Spalten nur halb zu sehen. Die Felder sind jetzt mitwachsende Textfelder – der Text bricht
   * an der Spaltenbreite um und bleibt immer ganz sichtbar. Enter springt weiterhin in die nächste Zeile.
   * Nur die kurze Wortart-Spalte bleibt einzeilig.
   */
  const feld = (f: Feld, label: string, placeholder?: string, letztesFeld = false): React.JSX.Element => {
    const attr = zielsprachig(f) ? sprachAttribute(sprache) : {}
    const Feldart = f === 'pos' ? TextInput : Textarea
    return (
      <Feldart
        variant="unstyled"
        {...(f === 'pos' ? {} : { autosize: true, minRows: 1 })}
        aria-label={`${label} in Zeile ${nr}`}
        // Leserecht (23.10.2026): ohne Beispieltexte, sonst sähe eine leere Zelle nach Eingabefeld aus
        placeholder={nurLesen ? undefined : placeholder}
        value={(v[f] as string | undefined) ?? ''}
        readOnly={nurLesen}
        data-zeile={v.id}
        data-feld={f}
        lang={attr.lang}
        dir={attr.dir}
        styles={{
          input: {
            ...(f === 'pos' ? {} : UMBRUCH),
            ...(f === 'term' && v.grey ? { color: 'var(--mantine-color-dimmed)' } : {}),
            ...(attr.style ?? {})
          }
        }}
        onChange={(e) => aendern(v.id, { [f]: e.currentTarget.value }, `zeile:${v.id}:${f}`)}
        onKeyDown={(e) => {
          if (nurLesen) return
          if (e.key === 'Enter') {
            e.preventDefault()
            weiter(v.id, f)
          } else if (e.key === 'Tab' && !e.shiftKey && letzte && letztesFeld) {
            e.preventDefault()
            neueZeile()
          }
        }}
      />
    )
  }
  return (
    <Table.Tr data-zusatz={v.grey ? '' : undefined} style={abfragen && !abgefragt ? { opacity: 0.6 } : undefined}>
      {abfragen && (
        <Table.Td>
          <Checkbox
            aria-label={`„${name}“ abfragen`}
            checked={abgefragt}
            disabled={nurLesen}
            onChange={(e) => aendern(v.id, { include: e.currentTarget.checked })}
          />
        </Table.Td>
      )}
      <Table.Td>
        <Text size="xs" c="dimmed">
          {nr}
        </Text>
      </Table.Td>
      <Table.Td>
        <Group gap={4} wrap="nowrap">
          <div style={{ flex: 1, minWidth: 0 }}>{feld('term', 'Wort', BEISPIEL[sprache ?? 'en'] ?? BEISPIEL.en)}</div>
          {v.grey && (
            <Tooltip label={`${ZUSATZ} – muss nicht unbedingt gelernt werden`}>
              <Badge size="xs" variant="light" color="gray" tt="none" style={{ flexShrink: 0 }} data-testid="zusatz-kennzeichen">
                grau
              </Badge>
            </Tooltip>
          )}
          {v.inBox && (
            <Tooltip label="Stand im Buch in einem Kasten">
              <Badge size="xs" variant="outline" color="gray" tt="none" style={{ flexShrink: 0 }}>
                Kasten
              </Badge>
            </Tooltip>
          )}
          {abk && (
            <Tooltip label={`Abkürzung erkannt: ${abkVoll(abk)} – Lernende dürfen die Abkürzung, die Langform oder beides schreiben`}>
              <Badge size="xs" variant="light" color="blue" tt="none" style={{ flexShrink: 0 }} data-abkuerzung>
                Abk.
              </Badge>
            </Tooltip>
          )}
        </Group>
        {zusatz && (
          <Stack gap={2} mt={2} data-zusatzfelder>
            <TextInput
              size="xs"
              variant="filled"
              label="Aussprache als"
              placeholder="z. B. Y. A., young adults"
              aria-label={`Aussprache als – Zeile ${nr}`}
              value={v.aussprache ?? ''}
              readOnly={nurLesen}
              data-zeile={v.id}
              data-feld="aussprache"
              onChange={(e) => aendern(v.id, { aussprache: e.currentTarget.value }, `zeile:${v.id}:aussprache`)}
            />
            <TextInput
              size="xs"
              variant="filled"
              label="Auch richtig (mit ; trennen)"
              placeholder="z. B. telly; telebox"
              aria-label={`Auch richtig – Zeile ${nr}`}
              value={(v.auchRichtig ?? []).join('; ')}
              readOnly={nurLesen}
              data-zeile={v.id}
              data-feld="auchRichtig"
              onChange={(e) =>
                aendern(
                  v.id,
                  { auchRichtig: e.currentTarget.value.split(';').map((x, i, alle) => (i < alle.length - 1 ? x.trim() : x.trimStart())) },
                  `zeile:${v.id}:auchRichtig`
                )
              }
            />
          </Stack>
        )}
      </Table.Td>
      <Table.Td>{sprache === 'de' ? feld('translation', 'Bedeutung', 'einfache Erklärung') : feld('translation', 'Deutsch', 'erkunden')}</Table.Td>
      <Table.Td>{feld('pos', 'Wortart')}</Table.Td>
      {mitBeispiel && (
        <Table.Td>
          {feld('example', 'Beispielsatz')}
          <Textarea
            variant="unstyled"
            size="xs"
            autosize
            minRows={1}
            styles={{ input: { ...UMBRUCH, color: 'var(--mantine-color-dimmed)' } }}
            placeholder={nurLesen ? undefined : 'Übersetzung des Beispielsatzes'}
            aria-label={`Übersetzung des Beispielsatzes in Zeile ${nr}`}
            value={v.exampleTranslation ?? ''}
            readOnly={nurLesen}
            onChange={(e) => aendern(v.id, { exampleTranslation: e.currentTarget.value }, `zeile:${v.id}:exampleTranslation`)}
          />
          {fassungFeld}
        </Table.Td>
      )}
      <Table.Td>
        {feld('note', mitBeispiel ? 'Hinweis' : 'Beispiel oder Hinweis', undefined, true)}
        {!mitBeispiel && fassungFeld}
      </Table.Td>
      {medienAn && (
        <>
          <Table.Td>
            {/* Das Bild der Bedeutung (21.10.2026, shared/medienBedeutung.ts) – Aussprache weiter je Wort */}
            {/* Leserecht: ohne Bild kein leerer Bild-Knopf */}
            {nurLesen && !bildVon(sicht, v, sprache)?.bild ? null : (
              <BildZelle sicht={bildVon(sicht, v, sprache)} wort={v.term} onOeffnen={() => bildOeffnen(v)} stufe={bildStufe} />
            )}
          </Table.Td>
          <Table.Td>
            <Group gap={4} wrap="nowrap">
              {lagen.map((l) => (
                <TonZelle
                  key={l}
                  ton={tonVon(sicht, l)}
                  text={v.term}
                  art="wort"
                  lage={zwei ? l : undefined}
                  stimmlage={l}
                  lagenDa={lagenText ? lagen : undefined}
                  admin={medienAdmin}
                  gesprochen={sprechtext}
                  erzeugen={() => tonFuer(v.term, 'wort', v.term, l)}
                  neuErzeugen={medienAdmin && lagenText ? (ls, grund) => neuFuer(v.term, 'wort', undefined, ls, grund) : undefined}
                />
              ))}
            </Group>
          </Table.Td>
          <Table.Td>
            <Group gap={4} wrap="nowrap">
              {lagen.map((l) => (
                <TonZelle
                  key={l}
                  // Geschlechtsbezogene Sätze (12.10.2026): jede Stimme mit ihrer Fassung
                  ton={satzTonVon(sicht, satz, l)}
                  text={satz ? satzFuerLage(satz, sicht?.fassungen, l) : ''}
                  art="satz"
                  lage={zwei ? l : undefined}
                  stimmlage={l}
                  lagenDa={lagenText ? lagen : undefined}
                  admin={medienAdmin}
                  erzeugen={() => tonFuer(v.term, 'satz', satz ?? '', l)}
                  neuErzeugen={medienAdmin && lagenText ? (ls, grund) => neuFuer(v.term, 'satz', satz, ls, grund) : undefined}
                />
              ))}
            </Group>
          </Table.Td>
        </>
      )}
      {!nurLesen && (
        <Table.Td>
          <Group gap={2} wrap="nowrap" justify="flex-end">
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label={`Weitere Aktionen für „${name}“`}>
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => aendern(v.id, { grey: !v.grey })}>
                  {v.grey ? `Nicht mehr als ${ZUSATZ} kennzeichnen` : `Als ${ZUSATZ} kennzeichnen`}
                </Menu.Item>
                <Menu.Item onClick={() => aendern(v.id, { inBox: !v.inBox })}>
                  {v.inBox ? 'Nicht mehr als Kasten-Wort kennzeichnen' : 'Als Kasten-Wort kennzeichnen'}
                </Menu.Item>
                <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => neueZeile(v.id)}>
                  Zeile darunter einfügen
                </Menu.Item>
                {!zusatz && (
                  <Menu.Item onClick={() => setZusatzOffen(true)} data-zusatz-oeffnen>
                    Aussprache / weitere richtige Antworten …
                  </Menu.Item>
                )}
                {/* Geschlechtsbezogener Beispielsatz von Hand (12.10.2026): Fassung für die männliche Stimme anlegen, dann bearbeiten */}
                {medienAn && medienAdmin && satz && !fassungDa?.lage && (
                  <Menu.Item
                    onClick={() =>
                      void fassungSpeichern(v.term, satz, { lage: 'm', text: satz, uebersetzung: v.exampleTranslation, von: 'hand' }).catch((e: unknown) =>
                        notifyError(e, 'Fassung nicht gespeichert')
                      )
                    }
                    data-satz-fassung-anlegen
                  >
                    Beispielsatz für die andere Stimme anpassen …
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
            <Tooltip label={mitVerlauf ? 'Zeile löschen (Strg+Z holt sie zurück)' : 'Zeile löschen'}>
              <ActionIcon variant="subtle" color="gray" aria-label={`Zeile ${nr} löschen („${name}“)`} onClick={() => loeschen(v.id)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Table.Td>
      )}
    </Table.Tr>
  )
})
