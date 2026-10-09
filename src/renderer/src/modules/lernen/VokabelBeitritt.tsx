/**
 * Vokabeltraining per QR-Code/Code (03.10.2026): /s/vt/<CODE>.
 *
 * Lernende mit Konto kommen direkt hinein. Gäste geben Vorname + Anfangsbuchstabe ein und bekommen
 * einen persönlichen Code – damit lernen sie an anderen Tagen und Geräten weiter („Schon dabei?").
 * Die Anmeldung als Gast hält bis zum Ende des Lernzeitraums (Server: src/server/vokabeln.ts).
 * Seit 06.10.2026 auch für das Grammatiktraining (/s/gt/<CODE>, Server: src/server/grammatik.ts).
 */

const ARTEN = {
  vokabeln: { api: '/s/api/vokabeln', ziel: '/s/v/', seite: '/s/vt/', name: 'Vokabeltraining' },
  grammatik: { api: '/s/api/grammatik', ziel: '/s/g/', seite: '/s/gt/', name: 'Grammatiktraining' }
}
import { Alert, Button, Card, Center, Code, Group, Loader, Text, TextInput, Title } from '@mantine/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { CodeUnbekannt } from '../onlinetest/CodeUnbekannt'
import { FreischaltungHinweis } from './regal/planHinweise'

interface Info {
  id: string
  titel: string
  gaeste: boolean
  dabei: boolean
  bis: number | null
  /** Kurs nur mit Grammatik (08.10.2026) */
  nurGrammatik?: boolean
  /** Geplante Freischaltung (09.10.2026): noch nichts frei – ab dann */
  geplantAb?: number
}

const NAME_OK = /^\p{L}[\p{L}'-]*(?: \p{L}[\p{L}'-]*)? \p{L}{1,3}\.?$/u

export default function VokabelBeitritt({ code, art: welche = 'vokabeln' }: { code: string; art?: keyof typeof ARTEN }): React.JSX.Element {
  const A = ARTEN[welche]
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [art, setArt] = useState<'neu' | 'wieder'>('neu')
  const [name, setName] = useState('')
  const [wieder, setWieder] = useState('')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [persoenlich, setPersoenlich] = useState<{ id: string; wieder: string } | null>(null)
  const ich = window.__schulappsServer
  const mitKonto = Boolean(ich?.angemeldet && ich.quelle !== 'gast' && ich.rolle === 'schueler')
  const lehrkraft = Boolean(ich?.angemeldet && (ich.rolle === 'lehrkraft' || ich.rolle === 'admin'))
  // Kurs nur mit Grammatik (Sprachenlernen, 08.10.2026): nicht auf eine leere Vokabelseite, sondern zu „Meine Materialien"
  const nurGrammatik = useRef(false)
  // Vor einer geplanten Freischaltung (09.10.2026): beitreten ja, dann den Zeitpunkt nennen statt einer leeren Seite
  const geplant = useRef<number | null>(null)
  const [wartet, setWartet] = useState<{ ab: number; titel: string } | null>(null)
  const titelRef = useRef('')
  const ziel = (id: string): void => {
    if (geplant.current && geplant.current > Date.now()) return setWartet({ ab: geplant.current, titel: titelRef.current })
    window.location.assign(nurGrammatik.current ? '/s/' : `${A.ziel}${id}`)
  }

  const beitreten = useCallback(
    async (daten: Record<string, string>, pfad = `${A.api}/gast`): Promise<void> => {
      setLaeuft(true)
      setFehler('')
      try {
        const r = await senden<{ id: string; wieder?: string }>(pfad, { code, ...daten })
        if (r.wieder) setPersoenlich({ id: r.id, wieder: r.wieder })
        else ziel(r.id)
      } catch (e) {
        setFehler(e instanceof Error ? e.message : String(e))
      } finally {
        setLaeuft(false)
      }
    },
    [code, A.api]
  )
  useEffect(() => {
    void holen<Info>(`${A.api}/zugang?code=${encodeURIComponent(code)}`).then(
      (d) => {
        nurGrammatik.current = Boolean(d.nurGrammatik)
        geplant.current = d.geplantAb ?? null
        titelRef.current = d.titel
        if (d.dabei) return ziel(d.id)
        if (mitKonto) return void beitreten({})
        if (!d.gaeste) return window.location.assign(`/anmelden?ziel=${encodeURIComponent(`${A.seite}${code}`)}`)
        setInfo(d)
      },
      () => setInfo(null)
    )
  }, [code, mitKonto, beitreten])

  // Unbekannter Code (09.10.2026): dieselbe Meldung wie auf den anderen Code-Seiten
  if (info === null) return <CodeUnbekannt />
  if (wartet && !persoenlich) return <FreischaltungHinweis ab={wartet.ab} titel={wartet.titel} art={A.name} />
  if (persoenlich)
    return (
      <Card withBorder padding="lg" data-persoenlicher-code>
        <Title order={3} mb="xs">
          Dein persönlicher Code
        </Title>
        <Text mb="md">Schreib ihn dir auf – damit lernst du an anderen Tagen oder auf einem anderen Gerät weiter (mit deinem Namen und „Schon dabei?").</Text>
        <Center mb="md">
          <Code fz={32} px="lg" py="sm" style={{ letterSpacing: 4 }} data-wieder-code>
            {persoenlich.wieder}
          </Code>
        </Center>
        <Button fullWidth size="lg" onClick={() => (ziel(persoenlich.id), setPersoenlich(null))} data-vokabeln-los>
          Aufgeschrieben – los geht's
        </Button>
      </Card>
    )
  if (!info)
    return fehler ? (
      <Alert color="red">{fehler}</Alert>
    ) : (
      <Center py="xl">
        <Loader />
      </Center>
    )
  const nameOk = NAME_OK.test(name.trim().replace(/\s+/g, ' '))
  const ok = art === 'neu' ? nameOk : nameOk && wieder.replace(/[^A-Za-z0-9]/g, '').length >= 6
  return (
    <Card withBorder padding="lg" data-vokabel-beitritt>
      <Text c="dimmed" size="sm">
        {A.name}
        {info.bis ? ` · bis ${new Date(info.bis).toLocaleDateString('de-DE')}` : ''}
      </Text>
      <Title order={3} mb="md">
        {info.titel}
      </Title>
      {lehrkraft && (
        <Alert color="blue" mb="md">
          Mit einem Lehrkraft-Konto angemeldet. Der Lernstand steht in der App „{A.name}". Zum Ausprobieren wie ein Gast einen Namen eingeben – das Gerät ist
          danach als Gast angemeldet.
        </Alert>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!ok || laeuft) return
          void (art === 'neu' ? beitreten({ name }) : beitreten({ name, wieder }, `${A.api}/wieder`))
        }}
      >
        <TextInput
          label="Wie heißt du?"
          description="Vorname und Anfangsbuchstabe des Nachnamens, z. B. „Anna K.“"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          size="md"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-gastname
        />
        {art === 'wieder' && (
          <TextInput
            mt="sm"
            label="Dein persönlicher Code"
            value={wieder}
            onChange={(e) => setWieder(e.currentTarget.value.toUpperCase())}
            size="md"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            data-wieder-eingabe
          />
        )}
        {fehler && (
          <Alert color="red" mt="sm">
            {fehler}
          </Alert>
        )}
        <Button type="submit" mt="md" fullWidth size="md" disabled={!ok} loading={laeuft}>
          {art === 'neu' ? 'Mitlernen' : 'Weiterlernen'}
        </Button>
      </form>
      <Group justify="center" mt="sm">
        <Button variant="subtle" size="sm" onClick={() => (setArt(art === 'neu' ? 'wieder' : 'neu'), setFehler(''))} data-schon-dabei>
          {art === 'neu' ? 'Schon dabei? Mit persönlichem Code weiterlernen' : 'Zum ersten Mal hier'}
        </Button>
      </Group>
    </Card>
  )
}
