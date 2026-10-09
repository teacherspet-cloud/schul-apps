/**
 * Verbspiele (07.10.2026, im Plan-Modus mit der Lehrkraft abgestimmt) – im Vokabeltraining (Verben der Liste) und im
 * Grammatiktraining (Freigabe „Unregelmäßige Verben"), für alle Sprachen mit Verbliste:
 *  - Stammformen-Trio: die Formen eines Verbs zusammen aufdecken (Aufdecken spricht)
 *  - Formen-Blitz nach Gehör: Form hören → Spalte tippen (mehrdeutige wie „cut" zählen in jeder passenden Spalte)
 *  - Bild-Verb: Bild der Tätigkeit → Formen wählen (bis Fach 2) oder schreiben, danach alle hören
 *  - Muster sortieren: Verben ihrem Bildungsmuster zuordnen (nur Sprachen mit bekannten Mustern)
 * Ton: Aufnahme der Medienbank (Formen als „Sätze" unter der Grundform), sonst die Stimme des Geräts.
 */
import { ActionIcon, Badge, Button, Group, Progress, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { IconVolume } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { alsEintrag, formenGesprochen, formGesprochen, formPasst, formSchluessel, spaltenDerForm, sprechtext, type VerbKarte, type VerbSpalteKurz } from '@shared/verbTraining'
import { varianten, type VerbSprache } from '@shared/verben'
import { fehlformen, musterVon } from '../../../shared/verben/muster'
import { sprich } from '../VokabelTrainer'
import { useVtFarbe } from '../vtFarben'
import { apostrophHinweis } from '../apostrophHinweis'
import LoesungZeigen from '../LoesungZeigen'
import { gemischt, useSekunden } from './SpieleErkennen'

/** Was die Verbspiele brauchen */
export interface VerbDaten {
  karten: VerbKarte[]
  spalten: VerbSpalteKurz[]
  /** Sprache der Verbliste (Muster, Fehlformen) */
  sprache: VerbSprache
  /** Sprache für die Aussprache (wie bei den Vokabeln) */
  tonSprache: string
  bild: (k: VerbKarte) => string | undefined
  /** Gibt es Ton (Aufnahme oder Gerätestimme)? */
  mitTon: boolean
  /** Gibt es für diese Sprache Muster? */
  mitMuster: boolean
  /** Antwortform nach Fach im Kasten: schreiben statt wählen */
  schreiben?: (k: VerbKarte) => boolean
}

interface VerbSpielProps {
  verben: VerbDaten
  ende: (wert: number, fehler: string[]) => void
}

const erste = (zelle: string | undefined): string => (zelle ? varianten(zelle)[0] ?? zelle : '')
const folge = (k: VerbKarte, spalten: VerbSpalteKurz[]): string =>
  spalten
    .map((s) => erste(k.formen[s.id]))
    .filter(Boolean)
    .join(' – ')
/** Eine Form vorsprechen – `spalte` entscheidet bei „read" über /riːd/ oder /rɛd/ (09.10.2026) */
const sprichForm = (d: VerbDaten, form: string, spalte = ''): void =>
  sprich(formSchluessel(form, d.sprache, spalte), d.tonSprache, formGesprochen(form, d.sprache, spalte))
/** Alle Formen nacheinander, mit Pause statt Strich oder „slash" */
const sprichAlle = (d: VerbDaten, k: VerbKarte): void => {
  const da = d.spalten.filter((s) => k.formen[s.id])
  sprich(
    sprechtext(da.map((s) => k.formen[s.id]).join(', ')),
    d.tonSprache,
    formenGesprochen(Object.fromEntries(da.map((s) => [s.id, k.formen[s.id]])), d.sprache)
  )
}

/** Die Muster-Ids einer Liste (für „Muster sortieren") */
export const musterDer = (karten: VerbKarte[], sprache: VerbSprache): Map<string, { id: string; label: string }> => {
  const m = new Map<string, { id: string; label: string }>()
  for (const k of karten) {
    const x = musterVon(alsEintrag(k), sprache)
    if (x) m.set(k.id, x)
  }
  return m
}

// ---------------------------------------------------------------- Stammformen-Trio

export function StammformenTrio({ verben: d, ende }: VerbSpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const n = d.spalten.length
  const karten = useMemo(() => {
    const voll = d.karten.filter((k) => d.spalten.every((s) => k.formen[s.id]))
    return gemischt(
      gemischt(voll)
        .slice(0, n >= 4 ? 3 : 4)
        .flatMap((k) => d.spalten.map((s) => ({ key: `${k.id}-${s.id}`, vid: k.id, spalte: s.id, text: erste(k.formen[s.id]) })))
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [offen, setOffen] = useState<string[]>([])
  const [gefunden, setGefunden] = useState<Set<string>>(new Set())
  const [zuege, setZuege] = useState(0)
  const [daneben, setDaneben] = useState(false)
  const tippen = (c: (typeof karten)[number]): void => {
    if (offen.includes(c.key) || gefunden.has(c.vid) || daneben) return
    sprichForm(d, c.text, c.spalte)
    const neu = [...offen, c.key]
    const auswahl = neu.map((x) => karten.find((y) => y.key === x)!)
    // Eine Karte eines anderen Verbs: daneben
    if (auswahl.some((x) => x.vid !== auswahl[0].vid)) {
      setOffen(neu)
      setZuege((z) => z + 1)
      setDaneben(true)
      setTimeout(() => (setOffen([]), setDaneben(false)), 1100)
      return
    }
    if (neu.length < n) return setOffen(neu)
    setZuege((z) => z + 1)
    const g = new Set(gefunden).add(auswahl[0].vid)
    setGefunden(g)
    setOffen([])
    if (g.size * n === karten.length) setTimeout(() => ende(zuege + 1, []), 700)
  }
  return (
    <Stack data-spiel="verbtrio">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          Finde die {n} Formen eines Verbs ({d.spalten.map((s) => s.label).join(' – ')}).
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {zuege} Züge
        </Badge>
      </Group>
      <SimpleGrid cols={{ base: 3, sm: n >= 4 ? 4 : 3 }} spacing="xs">
        {karten.map((c) => {
          const sichtbar = offen.includes(c.key) || gefunden.has(c.vid)
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => tippen(c)}
              className={`vt-memory ${sichtbar ? 'auf' : ''} ${gefunden.has(c.vid) ? 'gefunden' : ''}`}
              data-trio-karte={c.vid}
              aria-label={sichtbar ? c.text : 'Verdeckte Karte'}
            >
              <span className="vt-memory-innen">
                <span className="vt-memory-zu">?</span>
                <span className="vt-memory-auf fs">{c.text}</span>
              </span>
            </button>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

// ---------------------------------------------------------------- Formen-Blitz nach Gehör

export function FormenBlitz({ verben: d, ende }: VerbSpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const sek = useSekunden()
  const DAUER = 60
  const neu = (): { k: VerbKarte; form: string; spalte: string } => {
    const k = gemischt(d.karten)[0]
    const s = gemischt(d.spalten.filter((x) => k.formen[x.id]))[0]
    return { k, form: erste(k.formen[s.id]), spalte: s.id }
  }
  const [runde, setRunde] = useState(neu)
  const [gut, setGut] = useState(0)
  const [abzug, setAbzug] = useState(0)
  const [rueck, setRueck] = useState<{ ok: boolean; richtig: string[] } | null>(null)
  const fehler = useRef(new Set<string>())
  const fertig = useRef(false)
  useEffect(() => {
    sprichForm(d, runde.form, runde.spalte)
  }, [runde]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (sek + abzug >= DAUER && !fertig.current) {
      fertig.current = true
      ende(gut, [...fehler.current])
    }
  }, [sek, abzug]) // eslint-disable-line react-hooks/exhaustive-deps
  const waehle = (spalte: string): void => {
    if (rueck || fertig.current) return
    const richtig = spaltenDerForm(runde.k, runde.form)
    const ok = richtig.includes(spalte)
    setRueck({ ok, richtig })
    if (ok) setGut((g) => g + 1)
    else {
      // Falsch auf Zeit (08.10.2026, Wunsch der Lehrkraft): ein Punkt und eine Sekunde weniger
      fehler.current.add(runde.k.id)
      setGut((g) => Math.max(0, g - 1))
      setAbzug((a) => a + 1)
    }
    setTimeout(
      () => {
        setRueck(null)
        setRunde(neu())
      },
      ok ? 700 : 1500
    )
  }
  return (
    <Stack align="center" data-spiel="formenblitz">
      <Group justify="space-between" w="100%">
        <Badge color={farbe.a} variant="light" size="lg">
          {gut} richtig
        </Badge>
        <Text fw={700}>{Math.max(0, DAUER - sek - abzug)} s</Text>
      </Group>
      <Progress value={(Math.min(sek, DAUER) / DAUER) * 100} w="100%" radius="xl" color={farbe.a} />
      <ActionIcon
        size={80}
        radius="xl"
        variant="light"
        color={farbe.a}
        onClick={() => sprichForm(d, runde.form, runde.spalte)}
        aria-label="Noch einmal anhören"
        data-blitz-form={runde.form}
      >
        <IconVolume size={40} />
      </ActionIcon>
      <Text fz={22} fw={800} mih={34}>
        {rueck ? `${runde.form} (${runde.k.de})` : ''}
      </Text>
      {/* Am Handy untereinander – die Spaltennamen („past participle") passen sonst nicht */}
      <SimpleGrid cols={{ base: 1, sm: d.spalten.length > 3 ? 2 : d.spalten.length }} spacing="xs" w="100%" maw={560}>
        {d.spalten.map((s) => {
          const zustand = rueck ? (rueck.richtig.includes(s.id) ? 'gut' : undefined) : undefined
          return (
            <Button
              key={s.id}
              size="lg"
              radius="lg"
              variant={zustand ? 'filled' : 'default'}
              color={zustand ? 'green' : undefined}
              style={{ height: 'auto', minHeight: 56, whiteSpace: 'normal' }}
              onClick={() => waehle(s.id)}
              data-spalte={s.id}
            >
              {s.label}
            </Button>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

// ---------------------------------------------------------------- Bild-Verb

export function BildVerb({ verben: d, ende }: VerbSpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const reihe = useMemo(() => gemischt(d.karten.filter((k) => d.bild(k))).slice(0, 8), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [gut, setGut] = useState(0)
  const [rueck, setRueck] = useState<boolean | null>(null)
  const [eingaben, setEingaben] = useState<Record<string, string>>({})
  const fehler = useRef(new Set<string>())
  const k = reihe[i]
  const schreiben = k ? d.schreiben?.(k) ?? false : false
  // Wählen: die richtige Folge und drei mit typischen Fehlformen
  const optionen = useMemo(() => {
    if (!k) return []
    const richtig = folge(k, d.spalten)
    const falsche = new Set<string>()
    for (const s of gemischt(d.spalten.filter((x) => k.formen[x.id]))) {
      for (const f of fehlformen(alsEintrag(k), s.id, d.sprache).slice(0, 2)) {
        const kopie = { ...k, formen: { ...k.formen, [s.id]: f } }
        falsche.add(folge(kopie, d.spalten))
      }
      if (falsche.size >= 3) break
    }
    return gemischt([richtig, ...[...falsche].filter((x) => x !== richtig).slice(0, 3)])
  }, [k]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!k) return <Text c="dimmed">Dafür gibt es noch zu wenige Verben mit Bild.</Text>
  const weiter = (ok: boolean): void => {
    setRueck(ok)
    if (ok) setGut((g) => g + 1)
    else fehler.current.add(k.id)
    sprichAlle(d, k)
    setTimeout(
      () => {
        if (i + 1 >= reihe.length) return ende(gut + (ok ? 1 : 0), [...fehler.current])
        setI(i + 1)
        setRueck(null)
        setEingaben({})
      },
      ok ? 1400 : 2400
    )
  }
  return (
    <Stack align="center" data-spiel="bildverb">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Verb {i + 1} von {reihe.length}
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {gut} richtig
        </Badge>
      </Group>
      <img src={d.bild(k)} alt="" style={{ width: 200, height: 200, objectFit: 'contain', borderRadius: 16, background: '#fff' }} data-bildverb-bild={k.id} />
      <Text fw={700}>{k.de}</Text>
      {rueck !== null ? (
        <Badge size="xl" radius="md" color={rueck ? 'green' : 'red'} variant="light" tt="none" data-runde-urteil={rueck ? 'richtig' : 'falsch'}>
          {rueck ? 'Richtig!' : 'Richtig:'} {folge(k, d.spalten)}
        </Badge>
      ) : schreiben ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const gut = d.spalten.every((s) => !k.formen[s.id] || formPasst(eingaben[s.id] ?? '', k.formen[s.id]))
            if (gut) apostrophHinweis(Object.values(eingaben).join(' '))
            weiter(gut)
          }}
          style={{ width: '100%', maxWidth: 520 }}
        >
          <Stack gap="xs">
            {d.spalten
              .filter((s) => k.formen[s.id])
              .map((s, j) => (
                <TextInput
                  key={s.id}
                  label={s.label}
                  size="md"
                  value={eingaben[s.id] ?? ''}
                  onChange={(e) => setEingaben({ ...eingaben, [s.id]: e.currentTarget.value })}
                  autoFocus={j === 0}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-bildverb-eingabe={s.id}
                />
              ))}
            <Button type="submit" data-pruefen>
              Prüfen
            </Button>
            {/* Nicht gewusst (09.10.2026): zählt als falsch, die Formen werden gezeigt */}
            <Group justify="center">
              <LoesungZeigen zeigen={() => weiter(false)} />
            </Group>
          </Stack>
        </form>
      ) : (
        <SimpleGrid cols={1} w="100%" maw={520} spacing="xs">
          {optionen.map((o) => (
            <Button
              key={o}
              size="lg"
              radius="lg"
              variant="default"
              style={{ height: 'auto', minHeight: 52, whiteSpace: 'normal' }}
              onClick={() => weiter(o === folge(k, d.spalten))}
              data-option={o}
            >
              {o}
            </Button>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- Muster sortieren

export function MusterSortieren({ verben: d, ende }: VerbSpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const muster = useMemo(() => musterDer(d.karten, d.sprache), [d])
  const reihe = useMemo(() => gemischt(d.karten.filter((k) => muster.has(k.id))).slice(0, 8), []) // eslint-disable-line react-hooks/exhaustive-deps
  // Wählbar: alle Muster, die in der Runde vorkommen (höchstens 5)
  const faecher = useMemo(() => {
    const m = new Map<string, string>()
    for (const k of reihe) {
      const x = muster.get(k.id)!
      m.set(x.id, x.label)
    }
    return [...m.entries()].slice(0, 5)
  }, [reihe, muster])
  const [i, setI] = useState(0)
  const [gut, setGut] = useState(0)
  const [rueck, setRueck] = useState<string | null>(null)
  const fehler = useRef(new Set<string>())
  const k = reihe[i]
  if (!k || faecher.length < 2) return <Text c="dimmed">Dafür gibt es noch zu wenige Verben mit verschiedenen Mustern.</Text>
  const richtig = muster.get(k.id)!.id
  const waehle = (id: string): void => {
    if (rueck) return
    setRueck(id)
    const ok = id === richtig
    if (ok) setGut((g) => g + 1)
    else fehler.current.add(k.id)
    setTimeout(
      () => {
        if (i + 1 >= reihe.length) return ende(gut + (ok ? 1 : 0), [...fehler.current])
        setI(i + 1)
        setRueck(null)
      },
      ok ? 800 : 1800
    )
  }
  return (
    <Stack align="center" data-spiel="muster">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Verb {i + 1} von {reihe.length} – welches Muster?
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {gut} richtig
        </Badge>
      </Group>
      <Group gap="xs">
        <Text fz={26} fw={800} data-muster-verb={k.id}>
          {folge(k, d.spalten)}
        </Text>
        {d.mitTon && (
          <ActionIcon size="lg" radius="xl" variant="light" color={farbe.a} onClick={() => sprichAlle(d, k)} aria-label="Anhören">
            <IconVolume size={20} />
          </ActionIcon>
        )}
      </Group>
      <SimpleGrid cols={1} w="100%" maw={520} spacing="xs">
        {faecher.map(([id, label]) => (
          <Button
            key={id}
            size="lg"
            radius="lg"
            variant={rueck && id === richtig ? 'filled' : 'default'}
            color={rueck ? (id === richtig ? 'green' : id === rueck ? 'red' : undefined) : undefined}
            style={{ height: 'auto', minHeight: 52, whiteSpace: 'normal' }}
            onClick={() => waehle(id)}
            data-muster={id}
          >
            {label}
          </Button>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
