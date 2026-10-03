/**
 * Vokabelspiele zum Schreiben (03.10.2026, abgestimmt): Wortraten (eine Blume statt Galgen),
 * Kreuzworträtsel, Fallende Wörter, Buchstabensalat.
 */
import { Badge, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { bewerte } from '@shared/vokabeltrainer'
import { gitterform, spielform, suchselGitter, suchselZellen } from '@shared/vokabelSpiele'
import { buildCrossword } from '../../vokabeltest/generation/crossword'
import { createRng, randomSeed } from '../../vokabeltest/model/random'
import { gemischt, useSekunden, type SpielProps } from './SpieleErkennen'
import { useVtFarbe } from '../vtFarben'

// ---------------------------------------------------------------- Wortraten

const BLAETTER = 7

export function Wortraten({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const reihe = useMemo(() => gemischt(woerter).slice(0, 6), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [geraten, setGeraten] = useState<string[]>([])
  const [blaetter, setBlaetter] = useState(BLAETTER)
  const [geloest, setGeloest] = useState(0)
  const fehler = useRef(new Set<string>())
  const v = reihe[i]
  const wort = spielform(v.term)
  const klein = wort.toLocaleLowerCase()
  const istBuchstabe = (c: string): boolean => /\p{L}/u.test(c)
  const fertig = [...klein].every((c) => !istBuchstabe(c) || geraten.includes(c))
  const verloren = blaetter <= 0
  // Tastatur: Alphabet plus die Sonderbuchstaben, die in den Wörtern vorkommen
  const tasten = useMemo(() => {
    const extra = [...new Set(reihe.flatMap((w) => [...spielform(w.term).toLocaleLowerCase()]).filter((c) => istBuchstabe(c) && !/[a-z]/.test(c)))]
    return [...'abcdefghijklmnopqrstuvwxyz', ...extra]
  }, [reihe])
  const raten = (c: string): void => {
    if (fertig || verloren || geraten.includes(c)) return
    setGeraten([...geraten, c])
    if (!klein.includes(c)) setBlaetter((b) => b - 1)
  }
  const weiter = (): void => {
    if (fertig) setGeloest((g) => g + 1)
    else fehler.current.add(v.id)
    const g = geloest + (fertig ? 1 : 0)
    if (i + 1 >= reihe.length) return ende(g, [...fehler.current])
    setI(i + 1)
    setGeraten([])
    setBlaetter(BLAETTER)
  }
  return (
    <Stack data-spiel="wortraten" align="center">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Wort {i + 1} von {reihe.length}
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {geloest} erraten
        </Badge>
      </Group>
      {/* Die Blume verliert für jeden falschen Buchstaben ein Blatt */}
      <div className="vt-blume" aria-label={`${blaetter} Blätter übrig`}>
        {Array.from({ length: BLAETTER }, (_, k) => (
          <span key={k} className={`vt-blatt ${k < blaetter ? '' : 'weg'}`} style={{ transform: `rotate(${(360 / BLAETTER) * k}deg) translateY(-26px)` }} />
        ))}
        <span className="vt-bluete" />
      </div>
      <Text size="lg" c="dimmed">
        {v.translation}
      </Text>
      <Group gap={6} justify="center" data-wortraten-wort>
        {[...wort].map((c, k) =>
          istBuchstabe(c) ? (
            <span key={k} className="vt-raten-feld">
              {geraten.includes(c.toLocaleLowerCase()) || verloren ? c : ''}
            </span>
          ) : (
            <span key={k} style={{ width: c === ' ' ? 14 : 'auto', fontWeight: 700 }}>
              {c === ' ' ? '' : c}
            </span>
          )
        )}
      </Group>
      {fertig || verloren ? (
        <Stack align="center" gap={6}>
          <Text fw={700} c={fertig ? 'teal' : 'red'}>
            {fertig ? 'Erraten!' : `Das Wort war: ${wort}`}
          </Text>
          <Button className="vt-los" radius="xl" onClick={weiter} data-wortraten-weiter>
            Weiter
          </Button>
        </Stack>
      ) : (
        <Group gap={4} justify="center" maw={520}>
          {tasten.map((c) => (
            <Button
              key={c}
              size="compact-md"
              w={38}
              h={42}
              variant={geraten.includes(c) ? (klein.includes(c) ? 'filled' : 'light') : 'default'}
              color={geraten.includes(c) ? (klein.includes(c) ? 'teal' : 'gray') : undefined}
              disabled={geraten.includes(c)}
              onClick={() => raten(c)}
              data-taste={c}
            >
              {c}
            </Button>
          ))}
        </Group>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- Kreuzworträtsel

export function Kreuzwort({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const raetsel = useMemo(() => {
    const kandidaten = gemischt(woerter)
      .map((v) => ({ id: v.id, word: gitterform(v.term) }))
      .filter((x) => x.word.length >= 3 && x.word.length <= 12)
      .slice(0, 9)
    return buildCrossword(kandidaten, createRng(randomSeed()))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [eingabe, setEingabe] = useState<Record<string, string>>({})
  const [geprueft, setGeprueft] = useState(false)
  const sek = useSekunden(true)
  const fehlerWoerter = useRef(new Set<string>())
  const zellen = useMemo(() => {
    const m = new Map<string, { loesung: string; nummer?: number }>()
    for (const p of raetsel.placed)
      [...p.word].forEach((c, k) => {
        const key = `${p.row + (p.dir === 'down' ? k : 0)}-${p.col + (p.dir === 'across' ? k : 0)}`
        const alt = m.get(key)
        m.set(key, { loesung: c, nummer: k === 0 ? p.number : alt?.nummer })
      })
    return m
  }, [raetsel])
  const v = (id: string) => woerter.find((w) => w.id === id)!
  const pruefen = (): void => {
    setGeprueft(true)
    const falsch = raetsel.placed.filter((p) =>
      [...p.word].some((c, k) => (eingabe[`${p.row + (p.dir === 'down' ? k : 0)}-${p.col + (p.dir === 'across' ? k : 0)}`] ?? '').toLocaleUpperCase() !== c)
    )
    // Falsche Wörter bleiben rot markiert, gespielt wird weiter; gemerkt werden sie für „nochmal ansehen"
    falsch.forEach((p) => fehlerWoerter.current.add(p.id))
    if (!falsch.length) setTimeout(() => ende(sek, [...fehlerWoerter.current]), 600)
  }
  const fokus = (z: number, s: number): void => {
    // Nach einem Buchstaben ins nächste Feld (rechts, sonst unten)
    const naechste =
      document.querySelector<HTMLInputElement>(`[data-kreuz="${z}-${s + 1}"]`) ?? document.querySelector<HTMLInputElement>(`[data-kreuz="${z + 1}-${s}"]`)
    naechste?.focus()
  }
  if (!raetsel.placed.length) return <Text c="dimmed">Für ein Kreuzworträtsel braucht es mehr Wörter.</Text>
  const zelle = 30
  return (
    <Stack data-spiel="kreuzwort" align="center">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Trage die Wörter in der Fremdsprache ein.
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {sek} s
        </Badge>
      </Group>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${raetsel.cols}, ${zelle}px)`, gap: 2 }}>
          {Array.from({ length: raetsel.rows * raetsel.cols }, (_, n) => {
            const z = Math.floor(n / raetsel.cols)
            const s = n % raetsel.cols
            const c = zellen.get(`${z}-${s}`)
            if (!c) return <span key={n} />
            const wert = eingabe[`${z}-${s}`] ?? ''
            const rot = geprueft && wert.toLocaleUpperCase() !== c.loesung
            return (
              <span key={n} style={{ position: 'relative', width: zelle, height: zelle }}>
                {c.nummer && <span style={{ position: 'absolute', left: 2, top: 0, fontSize: 9, color: 'var(--vt-a-dunkel)', zIndex: 1 }}>{c.nummer}</span>}
                <input
                  value={wert}
                  maxLength={1}
                  onChange={(e) => {
                    setGeprueft(false)
                    setEingabe({ ...eingabe, [`${z}-${s}`]: e.currentTarget.value.slice(-1) })
                    if (e.currentTarget.value) fokus(z, s)
                  }}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  data-kreuz={`${z}-${s}`}
                  style={{
                    width: zelle,
                    height: zelle,
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    fontSize: 15,
                    border: `1.5px solid ${rot ? 'var(--vt-schlecht-rand)' : 'var(--vt-a-zart)'}`,
                    borderRadius: 4,
                    background: rot ? 'var(--vt-schlecht-bg)' : 'var(--vt-flaeche)',
                    color: 'var(--vt-tinte)',
                    padding: 0
                  }}
                />
              </span>
            )
          })}
        </div>
      </div>
      <Stack gap={2} w="100%" maw={560}>
        {(['across', 'down'] as const).map((dir) => (
          <div key={dir}>
            <Text fw={700} size="sm" c="var(--vt-a-dunkel)">
              {dir === 'across' ? 'Waagerecht' : 'Senkrecht'}
            </Text>
            {raetsel.placed
              .filter((p) => p.dir === dir)
              .sort((a, b) => a.number - b.number)
              .map((p) => (
                <Text key={p.id} size="sm">
                  {p.number}. {v(p.id).translation}
                </Text>
              ))}
          </div>
        ))}
      </Stack>
      <Button className="vt-los" radius="xl" onClick={pruefen} data-kreuz-pruefen>
        Prüfen
      </Button>
    </Stack>
  )
}

// ---------------------------------------------------------------- Fallende Wörter

interface Fallend {
  key: number
  id: string
  y: number
  x: number
  tempo: number
}

export function FallendeWoerter({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const [fallen, setFallen] = useState<Fallend[]>([])
  const [leben, setLeben] = useState(3)
  const [geschafft, setGeschafft] = useState(0)
  const [text, setText] = useState('')
  const zaehler = useRef(0)
  const fehler = useRef(new Set<string>())
  const fertig = useRef(false)
  const feld = useRef<HTMLInputElement>(null)
  const v = (id: string) => woerter.find((w) => w.id === id)!
  useEffect(() => {
    feld.current?.focus()
    const schritt = setInterval(() => {
      setFallen((liste) => {
        const weiter: Fallend[] = []
        for (const f of liste) {
          const y = f.y + f.tempo
          if (y >= 1) {
            fehler.current.add(f.id)
            setLeben((l) => l - 1)
          } else weiter.push({ ...f, y })
        }
        return weiter
      })
    }, 50)
    return () => clearInterval(schritt)
  }, [])
  // Neue Wörter: anfangs alle 3 s, mit jedem Treffer etwas schneller
  useEffect(() => {
    if (leben <= 0) return
    const neu = (): void => {
      const w = woerter[Math.floor(Math.random() * woerter.length)]
      zaehler.current++
      setFallen((l) => [...l, { key: zaehler.current, id: w.id, y: 0, x: 0.08 + Math.random() * 0.6, tempo: 0.0055 + Math.min(0.009, geschafft * 0.0004) }])
    }
    if (!zaehler.current) neu()
    const t = setInterval(neu, Math.max(1300, 3000 - geschafft * 90))
    return () => clearInterval(t)
  }, [geschafft, leben, woerter])
  useEffect(() => {
    if (leben <= 0 && !fertig.current) {
      fertig.current = true
      ende(geschafft, [...fehler.current])
    }
  }, [leben, geschafft, ende])
  const eingeben = (wert: string): void => {
    setText(wert)
    const treffer = fallen.find((f) => bewerte(wert, v(f.id).term).urteil === 'richtig')
    if (!treffer) return
    setFallen((l) => l.filter((f) => f.key !== treffer.key))
    setGeschafft((g) => g + 1)
    setText('')
  }
  return (
    <Stack data-spiel="fallend">
      <Group justify="space-between">
        <Badge color="red" variant="light" size="lg">
          {'♥'.repeat(Math.max(0, leben))}
        </Badge>
        <Badge color={farbe.a} variant="light" size="lg">
          {geschafft} geschafft
        </Badge>
      </Group>
      <div className="vt-fallfeld">
        {fallen.map((f) => (
          <span key={f.key} className="vt-fallwort" style={{ top: `${f.y * 88}%`, left: `${f.x * 100}%` }} data-fallwort={f.id}>
            {v(f.id).translation}
          </span>
        ))}
      </div>
      <TextInput
        ref={feld}
        size="lg"
        value={text}
        onChange={(e) => eingeben(e.currentTarget.value)}
        placeholder="Übersetzung tippen …"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-fallend-eingabe
      />
    </Stack>
  )
}

// ---------------------------------------------------------------- Buchstabensalat (Suchsel)

export function Suchsel({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const gitter = useMemo(
    () =>
      suchselGitter(
        gemischt(woerter)
          .map((v) => ({ id: v.id, wort: gitterform(v.term) }))
          .filter((x) => x.wort.length >= 3 && x.wort.length <= 10)
          .slice(0, 8)
      ),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [start, setStart] = useState<number | null>(null)
  const [gefunden, setGefunden] = useState<string[]>([])
  const [daneben, setDaneben] = useState<number[]>([])
  const sek = useSekunden(gefunden.length < gitter.woerter.length)
  const v = (id: string) => woerter.find((w) => w.id === id)!
  const markiert = new Set(gitter.woerter.filter((w) => gefunden.includes(w.id)).flatMap(suchselZellen))
  const tippen = (n: number): void => {
    if (start === null) return setStart(n)
    const treffer = gitter.woerter.find((w) => {
      const z = suchselZellen(w)
      return !gefunden.includes(w.id) && ((z[0] === start && z[z.length - 1] === n) || (z[0] === n && z[z.length - 1] === start))
    })
    setStart(null)
    if (!treffer) {
      setDaneben([start, n])
      setTimeout(() => setDaneben([]), 500)
      return
    }
    const g = [...gefunden, treffer.id]
    setGefunden(g)
    if (g.length === gitter.woerter.length) setTimeout(() => ende(sek, []), 600)
  }
  return (
    <Stack data-spiel="suchsel" align="center">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Tippe den ersten und den letzten Buchstaben eines Wortes.
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {sek} s · {gefunden.length}/{gitter.woerter.length}
        </Badge>
      </Group>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gitter.groesse}, minmax(26px, 34px))`, gap: 3, maxWidth: '100%' }}>
        {gitter.zellen.map((c, n) => (
          <button
            key={n}
            type="button"
            onClick={() => tippen(n)}
            className={`vt-such ${markiert.has(n) ? 'gefunden' : ''} ${start === n ? 'start' : ''} ${daneben.includes(n) ? 'daneben' : ''}`}
            data-such={n}
          >
            {c}
          </button>
        ))}
      </div>
      <Group gap={6} justify="center" maw={560}>
        {gitter.woerter.map((w) => (
          <Badge key={w.id} size="lg" variant={gefunden.includes(w.id) ? 'filled' : 'light'} color={gefunden.includes(w.id) ? 'teal' : farbe.a} tt="none">
            {gefunden.includes(w.id) ? `${v(w.id).translation} = ${spielform(v(w.id).term)}` : v(w.id).translation}
          </Badge>
        ))}
      </Group>
    </Stack>
  )
}
