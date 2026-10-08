/**
 * Vokabelspiele zum Schreiben (03.10.2026, abgestimmt): Wortraten (eine Blume statt Galgen),
 * Kreuzworträtsel, Fallende Wörter, Buchstabensalat.
 */
import { Badge, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { bewerte, kernform } from '@shared/vokabeltrainer'
import { gitterform, spielform, suchselGitter, suchselZellen } from '@shared/vokabelSpiele'
import { buildCrossword } from '../../vokabeltest/generation/crossword'
import { createRng, randomSeed } from '../../vokabeltest/model/random'
import { gemischt, useSekunden, type SpielProps } from './SpieleErkennen'
import { useVtFarbe } from '../vtFarben'
import { apostrophHinweis } from '../apostrophHinweis'

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
    setEingabe('')
    setDaneben(false)
  }
  /*
   * Eingabe über die Tastatur (03.10.2026, Wunsch der Lehrkraft – auch am Smartphone und Tablet): Ein
   * Buchstabe rät den Buchstaben, ein ganzes Wort löst (falsch kostet ein Blatt). Das Feld holt am
   * Telefon die Bildschirmtastatur; am Computer geht es auch ohne Feld direkt mit den Tasten.
   */
  const [eingabe, setEingabe] = useState('')
  const [daneben, setDaneben] = useState(false)
  const feld = useRef<HTMLInputElement>(null)
  const loesen = (): void => {
    const t = eingabe.trim().toLocaleLowerCase()
    setEingabe('')
    if (!t || fertig || verloren) return
    if ([...t].length === 1) return raten(t)
    if (t === klein || kernform(t) === kernform(klein)) {
      apostrophHinweis(eingabe)
      setGeraten([...new Set([...geraten, ...[...klein].filter(istBuchstabe)])])
      setDaneben(false)
    } else {
      setBlaetter((b) => b - 1)
      setDaneben(true)
    }
  }
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      const ziel = e.target as HTMLElement | null
      if (ziel?.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter' && (fertig || verloren)) {
        e.preventDefault()
        return weiter()
      }
      if (e.key.length === 1 && istBuchstabe(e.key)) {
        e.preventDefault()
        raten(e.key.toLocaleLowerCase())
      }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  })
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
        <Stack gap="sm" align="center" w="100%" maw={520}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              loesen()
            }}
            style={{ display: 'flex', gap: 8, width: '100%' }}
          >
            <TextInput
              ref={feld}
              style={{ flex: 1 }}
              size="md"
              value={eingabe}
              onChange={(e) => {
                setEingabe(e.currentTarget.value)
                setDaneben(false)
              }}
              placeholder="Buchstabe oder ganzes Wort tippen …"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              error={daneben ? 'Das war es nicht – ein Blatt weniger.' : undefined}
              data-wortraten-eingabe
            />
            <Button type="submit" className="vt-los" radius="xl" disabled={!eingabe.trim()} data-wortraten-loesen>
              OK
            </Button>
          </form>
          <Group gap={4} justify="center">
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
        </Stack>
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
  /*
   * Schreibrichtung (06.10.2026, Befund der Lehrkraft: Beim senkrechten Wort sprang der Cursor an einer Kreuzung ins
   * waagerechte Wort): Die Richtung des angefangenen Worts bleibt, bis ein anderes Feld angetippt wird; ein zweites
   * Antippen derselben Kreuzung wechselt sie. Rücktaste löscht und geht zurück – mehrere Buchstaben nacheinander.
   */
  const richtung = useRef<'across' | 'down'>('across')
  const zuletzt = useRef<string | null>(null)
  const da = (z: number, s: number): boolean => zellen.has(`${z}-${s}`)
  const waagerecht = (z: number, s: number): boolean => da(z, s - 1) || da(z, s + 1)
  const senkrecht = (z: number, s: number): boolean => da(z - 1, s) || da(z + 1, s)
  const feld = (z: number, s: number): HTMLInputElement | null => document.querySelector<HTMLInputElement>(`[data-kreuz="${z}-${s}"]`)
  const schritt = (z: number, s: number, d: 1 | -1): [number, number] => (richtung.current === 'across' ? [z, s + d] : [z + d, s])
  const angetippt = (z: number, s: number): void => {
    const key = `${z}-${s}`
    const beide = waagerecht(z, s) && senkrecht(z, s)
    if (beide && zuletzt.current === key) richtung.current = richtung.current === 'across' ? 'down' : 'across'
    else if (!beide) richtung.current = waagerecht(z, s) ? 'across' : 'down'
    zuletzt.current = key
  }
  const fokus = (z: number, s: number): void => {
    // Nach einem Buchstaben ins nächste Feld DESSELBEN Worts; am Wortende bleibt der Cursor stehen
    const [nz, ns] = schritt(z, s, 1)
    if (da(nz, ns)) {
      zuletzt.current = `${nz}-${ns}`
      feld(nz, ns)?.focus()
    }
  }
  const taste = (e: React.KeyboardEvent<HTMLInputElement>, z: number, s: number): void => {
    const key = `${z}-${s}`
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      setGeprueft(false)
      if (eingabe[key]) return setEingabe((x) => ({ ...x, [key]: '' }))
      // Leeres Feld: zurück und dort löschen
      const [vz, vs] = schritt(z, s, -1)
      if (!da(vz, vs)) return
      setEingabe((x) => ({ ...x, [`${vz}-${vs}`]: '' }))
      zuletzt.current = `${vz}-${vs}`
      feld(vz, vs)?.focus()
    } else if (e.key === ' ') {
      e.preventDefault()
      setGeprueft(false)
      setEingabe((x) => ({ ...x, [key]: '' }))
      fokus(z, s)
    }
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
                  onPointerDown={() => angetippt(z, s)}
                  onKeyDown={(e) => taste(e, z, s)}
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

/**
 * Tempo nach Klasse (08.10.2026, Wunsch der Lehrkraft): jüngere Klassen beginnen sehr langsam, mit jedem Treffer wird es
 * etwas schneller (5 % kürzere Fallzeit), höhere Jahrgänge starten und enden schneller. Fallzeit in Sekunden.
 */
export function fallTempo(klasse: number | null | undefined, treffer: number): { fallzeit: number; abstand: number } {
  const k = klasse ?? 6
  const [start, schnellstens] = k <= 6 ? [18, 7] : k <= 8 ? [13, 5] : k <= 10 ? [10, 4] : [8, 3]
  const fallzeit = Math.max(schnellstens, start * Math.pow(0.95, treffer))
  // Neue Wörter etwa im Abstand einer halben Fallzeit – so stehen höchstens zwei bis drei Wörter gleichzeitig da
  return { fallzeit, abstand: Math.max(1300, fallzeit * 500) }
}

export function FallendeWoerter({ woerter, ende, klasse }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const [fallen, setFallen] = useState<Fallend[]>([])
  const [leben, setLeben] = useState(3)
  const [geschafft, setGeschafft] = useState(0)
  const [text, setText] = useState('')
  const zaehler = useRef(0)
  const fehler = useRef(new Set<string>())
  const fertig = useRef(false)
  const feld = useRef<HTMLInputElement>(null)
  // Liste als Ref (08.10.2026): Der Takt rechnet ohne Nebenwirkungen in einer Zustandsberechnung – vorher zog das
  // Verlieren eines Lebens innerhalb von setFallen ein zweites setState nach sich (in React nicht vorgesehen)
  const liste = useRef<Fallend[]>([])
  const woerterRef = useRef(woerter)
  woerterRef.current = woerter
  const v = (id: string) => woerter.find((w) => w.id === id)!
  useEffect(() => {
    feld.current?.focus()
    const schritt = setInterval(() => {
      if (fertig.current) return
      let verloren = 0
      const weiter: Fallend[] = []
      for (const f of liste.current) {
        const y = f.y + f.tempo
        if (y >= 1) {
          fehler.current.add(f.id)
          verloren++
        } else weiter.push({ ...f, y })
      }
      liste.current = weiter
      setFallen(weiter)
      if (verloren) setLeben((l) => l - verloren)
    }, 50)
    return () => clearInterval(schritt)
  }, [])
  // Neue Wörter im Takt des Tempos (nach Klasse, mit jedem Treffer schneller)
  useEffect(() => {
    if (leben <= 0) return
    const { fallzeit, abstand } = fallTempo(klasse, geschafft)
    const neu = (): void => {
      const l = woerterRef.current
      const w = l[Math.floor(Math.random() * l.length)]
      if (!w) return
      zaehler.current++
      liste.current = [...liste.current, { key: zaehler.current, id: w.id, y: 0, x: 0.08 + Math.random() * 0.6, tempo: 1 / (fallzeit * 20) }]
      setFallen(liste.current)
    }
    // Steht kein Wort mehr da (alle getroffen oder alle gefallen), kommt das nächste sofort (08.10.2026);
    // fallen noch andere, bleibt der Takt. Treffer und verlorene Leben starten diesen Effekt neu.
    if (!zaehler.current || !liste.current.length) neu()
    const t = setInterval(neu, abstand)
    return () => clearInterval(t)
  }, [geschafft, leben, klasse])
  useEffect(() => {
    if (leben <= 0 && !fertig.current) {
      fertig.current = true
      ende(geschafft, [...fehler.current])
    }
  }, [leben, geschafft, ende])
  const eingeben = (wert: string): void => {
    setText(wert)
    const treffer = liste.current.find((f) => bewerte(wert, v(f.id).term).urteil === 'richtig')
    if (!treffer) return
    apostrophHinweis(wert)
    liste.current = liste.current.filter((f) => f.key !== treffer.key)
    setFallen(liste.current)
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

/**
 * Gerade Linie im Gitter von Zelle `von` Richtung `nach` (08.10.2026): rastet auf die nächstliegende der acht Richtungen
 * ein (waagerecht, senkrecht, diagonal) und endet am Rand.
 */
export function suchselLinie(groesse: number, von: number, nach: number): number[] {
  const r0 = Math.floor(von / groesse)
  const c0 = von % groesse
  const dr = Math.floor(nach / groesse) - r0
  const dc = (nach % groesse) - c0
  if (!dr && !dc) return [von]
  const achtel = Math.round(Math.atan2(dr, dc) / (Math.PI / 4))
  const sr = Math.round(Math.sin((achtel * Math.PI) / 4))
  const sc = Math.round(Math.cos((achtel * Math.PI) / 4))
  const laenge = sr && sc ? Math.max(Math.abs(dr), Math.abs(dc)) : sr ? Math.abs(dr) : Math.abs(dc)
  const aus = [von]
  for (let k = 1; k <= laenge; k++) {
    const r = r0 + sr * k
    const c = c0 + sc * k
    if (r < 0 || c < 0 || r >= groesse || c >= groesse) break
    aus.push(r * groesse + c)
  }
  return aus
}

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
  // Wort von Zelle a bis Zelle b prüfen (in beide Richtungen)
  const pruefen = (a: number, b: number): void => {
    const treffer = gitter.woerter.find((w) => {
      const z = suchselZellen(w)
      return !gefunden.includes(w.id) && ((z[0] === a && z[z.length - 1] === b) || (z[0] === b && z[z.length - 1] === a))
    })
    setStart(null)
    if (!treffer) {
      setDaneben([a, b])
      setTimeout(() => setDaneben([]), 500)
      return
    }
    const g = [...gefunden, treffer.id]
    setGefunden(g)
    if (g.length === gitter.woerter.length) setTimeout(() => ende(sek, []), 600)
  }
  const tippen = (n: number): void => {
    if (start === null) return setStart(n)
    pruefen(start, n)
  }
  /*
   * Ziehen (08.10.2026, Wunsch der Lehrkraft): mit Maus, Finger oder Stift vom ersten zum letzten Buchstaben; die Auswahl
   * rastet auf eine gerade Linie ein (waagerecht, senkrecht, diagonal). Antippen ohne Ziehen = Tippen wie bisher (erst
   * erster, dann letzter Buchstabe). Maus und Finger laufen nur über Zeigerereignisse, der Klick zählt nur von der Tastatur.
   */
  const [zug, setZug] = useState<number[]>([])
  const ziehen = useRef<{ von: number; bis: number; zeiger: number } | null>(null)
  const zelleBei = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-such]')
    const n = el ? Number(el.getAttribute('data-such')) : NaN
    return Number.isInteger(n) ? n : null
  }
  const runter = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const n = zelleBei(e.clientX, e.clientY)
    if (n === null) return
    e.preventDefault()
    ziehen.current = { von: n, bis: n, zeiger: e.pointerId }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ohne Einfangen geht es auch
    }
    setZug([n])
  }
  const bewegen = (e: React.PointerEvent<HTMLDivElement>): void => {
    const z = ziehen.current
    if (!z || z.zeiger !== e.pointerId) return
    const n = zelleBei(e.clientX, e.clientY)
    if (n === null) return
    const pfad = suchselLinie(gitter.groesse, z.von, n)
    if (pfad[pfad.length - 1] === z.bis) return
    z.bis = pfad[pfad.length - 1]
    setZug(pfad)
  }
  const hoch = (e: React.PointerEvent<HTMLDivElement>): void => {
    const z = ziehen.current
    if (!z || z.zeiger !== e.pointerId) return
    ziehen.current = null
    setZug([])
    if (z.bis === z.von) tippen(z.von)
    else pruefen(z.von, z.bis)
  }
  const abbrechen = (): void => {
    ziehen.current = null
    setZug([])
  }
  return (
    <Stack data-spiel="suchsel" align="center">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Ziehe über ein Wort – oder tippe den ersten und den letzten Buchstaben.
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {sek} s · {gefunden.length}/{gitter.woerter.length}
        </Badge>
      </Group>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gitter.groesse}, minmax(26px, 34px))`,
          gap: 3,
          maxWidth: '100%',
          // Auf dem Gitter ziehen statt blättern/zoomen (iPad): muss schon vor dem Berühren gelten
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
        onPointerDown={runter}
        onPointerMove={bewegen}
        onPointerUp={hoch}
        onPointerCancel={abbrechen}
        data-suchsel-gitter
      >
        {gitter.zellen.map((c, n) => (
          <button
            key={n}
            type="button"
            // Nur Tastatur (Enter/Leertaste: detail 0) – Maus, Finger und Stift laufen über die Zeigerereignisse
            onClick={(e) => {
              if (e.detail === 0) tippen(n)
            }}
            className={`vt-such ${markiert.has(n) ? 'gefunden' : ''} ${start === n || zug.includes(n) ? 'start' : ''} ${daneben.includes(n) ? 'daneben' : ''}`}
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
