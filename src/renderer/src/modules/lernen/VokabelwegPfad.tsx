/**
 * „Mein Vokabelweg" als Fortschrittspfad (09.10.2026, Entscheidung der Lehrkraft): Die Seite war bisher ein zweiter,
 * anklickbarer Karteikasten neben dem Kurs – jetzt zeigt sie nur noch, wie weit man im Lehrwerk gekommen ist. Geübt
 * wird im Kurs (Sprachenlernen).
 *
 *  - Je Unit ein Pfad mit einem Wegpunkt je Abschnitt (Station), in Buchreihenfolge.
 *  - Zwei Stufen (shared/vokabelLaufbahn.ts stationStand): „gelernt" = alle Wörter einmal kennengelernt (halber
 *    Stern), „abgeschlossen" = 80 % der Wörter ab Fach 2 – dieselbe Regel wie das Freischalten (Stern und Fähnchen).
 *    Das Wegstück vor einem Wegpunkt füllt sich dazwischen anteilig.
 *  - Die Eule steht am aktuellen Wegpunkt.
 *  - Breit waagerecht, auf dem Telefon senkrecht. Antippen zeigt nur eine kleine Auskunft – kein Üben von hier.
 *  - Abgeschlossene Units zu einer Zeile mit Pokal zusammengeklappt, die aktuelle offen, spätere gedimmt.
 *  - Ruhige Darstellung bzw. reduzierte Bewegung: keine Bewegung.
 */
import { Alert, Button, Center, Group, Loader, Popover, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconArrowLeft, IconChevronDown, IconConfetti, IconFlag3Filled, IconLock, IconStarFilled, IconStarHalfFilled, IconTrophy } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { fehlenBis, SCHWELLE, stationZahlen, wegUnits, type Stufe, type WegStufe } from '@shared/vokabelLaufbahn'
import { holen } from '../onlinetest/serverApi'
import { useDarstellung } from '../onlinetest/schuelerDarstellung'
import { Eule } from '../onlinetest/SchuelerStart'
import { rueckweg } from './regal/beschriftung'
import { TrainerFarben } from './VokabelTrainer'
import { useVtFarbe } from './vtFarben'
import type { WegKurz } from './VokabelLeiter'

const CSS = `
.vp { display: flex; flex-direction: column; gap: 16px; }
.vp-kopf { border-radius: 20px; padding: 18px; background: linear-gradient(120deg, var(--vt-a-mittel), var(--vt-a-tief)); color: var(--vt-auf-a); }
.vp-legende { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: .8rem; color: var(--vt-leise); }
.vp-legende span { display: inline-flex; align-items: center; gap: 4px; }
.vp-stern { color: #f59f00; }
.vp-unit { border-radius: 18px; padding: 14px 16px; background: var(--vt-flaeche); border: 1px solid var(--vt-a-rand); box-shadow: 0 4px 16px var(--vt-schatten); }
.vp-unit.spaeter { opacity: .5; box-shadow: none; }
.vp-fertig { display: flex; align-items: center; gap: 10px; width: 100%; border-radius: 16px; padding: 10px 14px; background: var(--vt-gut-bg); color: var(--vt-gut-text); font-weight: 700; }
.vp-pfad { display: flex; align-items: flex-start; overflow-x: auto; padding: 46px 4px 6px; }
.vp-schritt { display: flex; align-items: flex-start; flex: none; }
.vp-stueck { flex: none; width: 34px; height: 8px; margin-top: 23px; border-radius: 4px; background: var(--vt-linie); overflow: hidden; }
.vp-fuell { width: calc(var(--f) * 100%); height: 100%; background: var(--vt-a); border-radius: 4px; transition: width .7s ease-out; }
.vp-punkt { position: relative; display: flex; flex-direction: column; align-items: center; width: 76px; flex: none; }
.vp-knoten { position: relative; width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; padding: 0; font: inherit; font-weight: 800; font-size: .78rem;
  border: 3px solid var(--vt-a-zart); background: var(--vt-flaeche); color: var(--vt-a-dunkel); transition: transform .2s; }
.vp-knoten:hover, .vp-knoten:focus-visible { transform: scale(1.07); outline: none; box-shadow: 0 0 0 4px var(--vt-a-rand); }
.vp-knoten.gelernt { border-color: #f59f00; }
.vp-knoten.abgeschlossen { border-color: var(--vt-a); background: var(--vt-a); color: var(--vt-auf-akzent); }
.vp-knoten.gesperrt { border-color: var(--vt-linie); color: var(--vt-leise); background: var(--vt-a-hell); }
.vp-knoten.hier { box-shadow: 0 0 0 4px var(--vt-a-rand); }
.vp-fahne { position: absolute; top: -10px; right: -8px; color: var(--vt-gut-rand); filter: drop-shadow(0 1px 1px rgba(0,0,0,.25)); }
.vp-name { font-size: .7rem; color: var(--vt-leise); text-align: center; margin-top: 5px; line-height: 1.15; }
.vp-figur { position: absolute; top: -46px; left: 50%; transform: translateX(-50%); pointer-events: none; animation: vp-hops .8s ease-out 1; }
@keyframes vp-hops { 0% { transform: translate(-50%, -14px); opacity: 0 } 60% { transform: translate(-50%, 2px); opacity: 1 } 100% { transform: translate(-50%, 0) } }
.vp-neu { display: flex; gap: 10px; align-items: center; border-radius: 14px; padding: 10px 12px; background: var(--vt-gut-bg); color: var(--vt-gut-text); font-weight: 700; }
@media (max-width: 560px) {
  .vp-pfad { flex-direction: column; align-items: stretch; overflow-x: visible; padding: 4px 0; }
  .vp-schritt { flex-direction: column; }
  .vp-stueck { width: 8px; height: 26px; margin: 0 0 0 23px; }
  .vp-fuell { width: 100%; height: calc(var(--f) * 100%); transition: height .7s ease-out; }
  .vp-punkt { flex-direction: row; width: auto; gap: 12px; }
  .vp-name { text-align: left; margin-top: 0; font-size: .85rem; }
  .vp-figur { position: static; transform: none; animation: none; }
}
html.sa-ruhig .vp *, html.sa-ruhig .vp { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) { .vp *, .vp { animation: none !important; transition: none !important; } }
`

const kurz = (s: string): string => s.replace(/^Station\s*/i, 'St. ').replace(/^Unit\s*/i, 'U ').slice(0, 6)
const woerter = (n: number): string => `${n} ${n === 1 ? 'Wort' : 'Wörter'}`

/** Seite /s/vw/<reihe>: die Wege der Person laden und den gewählten zeigen */
export default function VokabelwegSeite({ wegKey }: { wegKey: string }): React.JSX.Element {
  const [wege, setWege] = useState<WegKurz[] | null | undefined>(undefined)
  const [fehler, setFehler] = useState('')
  useEffect(() => {
    void holen<{ wege: WegKurz[] }>('/s/api/vokabelweg').then(
      (d) => setWege(d.wege),
      (e: unknown) => {
        setFehler(e instanceof Error ? e.message : String(e))
        setWege(null)
      }
    )
  }, [])
  if (wege === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  const weg = wege?.find((w) => w.key === wegKey)
  if (!weg) return <Alert color="orange">{fehler || 'Diesen Vokabelweg gibt es nicht.'}</Alert>
  return (
    <TrainerFarben fach={weg.fach} fachFarbe={weg.farbe}>
      <VokabelwegPfad weg={weg} />
    </TrainerFarben>
  )
}

export function VokabelwegPfad({ weg }: { weg: WegKurz }): React.JSX.Element {
  const { units, figur } = useMemo(() => wegUnits(weg.stufen), [weg.stufen])
  const alle = units.flatMap((u) => u.stufen)
  const abgeschlossen = alle.filter((x) => x.stufe === 'abgeschlossen').length
  const halbe = alle.filter((x) => x.stufe === 'gelernt').length
  const fertig = alle.length > 0 && abgeschlossen === alle.length
  const materialien = useDarstellung((s) => s.d.materialien)
  const zurueck = rueckweg(weg.fach, 'vok', false, materialien !== 'liste')
  const farbe = useVtFarbe()
  // Zusammengeklappte Units, die zum Ansehen geöffnet wurden
  const [auf, setAuf] = useState<Set<number>>(new Set())
  // Neu abgeschlossen seit dem letzten Besuch? (je Gerät gemerkt; Abmelden räumt „vokabelweg-frei-…" weg)
  const speicher = `vokabelweg-frei-ab-${weg.key}`
  const [neu, setNeu] = useState<Stufe[]>([])
  useEffect(() => {
    const jetzt = alle.filter((x) => x.stufe === 'abgeschlossen').map((x) => x.s)
    try {
      const vorher = JSON.parse(localStorage.getItem(speicher) ?? 'null') as string[] | null
      if (vorher) setNeu(jetzt.filter((s) => !vorher.includes(s.key)))
      localStorage.setItem(speicher, JSON.stringify(jetzt.map((s) => s.key)))
    } catch {
      /* ohne Speicher keine Feier */
    }
  }, [speicher, weg.stufen]) // eslint-disable-line react-hooks/exhaustive-deps
  // Die Figur ins Bild rollen (waagerecht nur im Pfad, nicht die ganze Seite)
  useEffect(() => {
    const t = setTimeout(() => {
      const k = document.querySelector<HTMLElement>('[data-vp-hier]')
      const pfad = k?.closest<HTMLElement>('.vp-pfad')
      if (k && pfad && pfad.scrollWidth > pfad.clientWidth)
        pfad.scrollLeft = Math.max(0, k.getBoundingClientRect().left - pfad.getBoundingClientRect().left + pfad.scrollLeft - pfad.clientWidth / 2)
    }, 150)
    return () => clearTimeout(t)
  }, [figur])
  return (
    <div className="vp" data-vokabelweg={weg.key}>
      <style>{CSS}</style>
      <Button variant="subtle" color={farbe.a} component="a" href={zurueck.href} w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4} data-zurueck-lernen>
        {zurueck.text}
      </Button>
      <div className="vp-kopf">
        <Text size="sm" fw={600} style={{ opacity: 0.9 }}>
          Mein Vokabelweg · {weg.fach}
        </Text>
        <Title order={2} style={{ color: 'var(--vt-auf-a)', lineHeight: 1.15 }}>
          {weg.band}
        </Title>
        <Text size="sm" mt={6} style={{ opacity: 0.92 }} data-vp-zusammenfassung>
          {abgeschlossen} von {alle.length} Abschnitten abgeschlossen
          {halbe ? ` · bei ${halbe} ${halbe === 1 ? 'weiterem' : 'weiteren'} alle Wörter kennengelernt` : ''}
        </Text>
        <Text size="xs" mt={4} style={{ opacity: 0.85 }}>
          Hier siehst du, wie weit du im Buch gekommen bist. Geübt wird in deinem Kurs.
        </Text>
      </div>
      <div className="vp-legende" aria-label="Zeichen auf dem Weg">
        <span>
          <IconStarHalfFilled size={16} className="vp-stern" /> alle Wörter einmal kennengelernt
        </span>
        <span>
          <IconStarFilled size={16} className="vp-stern" />
          <IconFlag3Filled size={14} style={{ color: 'var(--vt-gut-rand)' }} /> {Math.round(SCHWELLE * 100)} % sicher genug (ab Fach 2) – der nächste Abschnitt wird frei
        </span>
      </div>
      {neu.length > 0 && (
        <div className="vp-neu" data-vw-neu>
          <IconConfetti size={22} />
          <span>Neu abgeschlossen: {neu.map((s) => `${s.unit} · ${s.section}`).join(', ')}!</span>
        </div>
      )}
      {fertig && (
        <div className="vp-neu" data-vp-alles>
          <IconTrophy size={22} />
          <span>Alle Abschnitte dieses Bandes abgeschlossen – der nächste Band kommt mit deiner Klasse.</span>
        </div>
      )}
      <Stack gap="sm">
        {units.map((u, ui) => {
          const zu = u.lage === 'fertig' && !auf.has(ui)
          const umschalten = (): void =>
            setAuf((m) => {
              const n = new Set(m)
              if (n.has(ui)) n.delete(ui)
              else n.add(ui)
              return n
            })
          if (zu)
            return (
              <UnstyledButton key={`${u.unit}-${ui}`} className="vp-fertig" onClick={umschalten} aria-expanded={false} data-vp-unit={u.unit} data-vp-lage="fertig">
                <IconTrophy size={20} />
                <span style={{ flex: 1 }}>
                  {u.unit} · alle {u.stufen.length} Abschnitte abgeschlossen
                </span>
                <IconChevronDown size={18} aria-hidden />
              </UnstyledButton>
            )
          const fertigHier = u.stufen.filter((x) => x.stufe === 'abgeschlossen').length
          return (
            <section key={`${u.unit}-${ui}`} className={`vp-unit ${u.lage}`} data-vp-unit={u.unit} data-vp-lage={u.lage}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={800} c="var(--vt-a-dunkel)">
                  {u.unit}
                </Text>
                <Group gap={6} wrap="nowrap">
                  <Text size="xs" c="dimmed">
                    {fertigHier} von {u.stufen.length} abgeschlossen
                  </Text>
                  {u.lage === 'fertig' && (
                    <UnstyledButton onClick={umschalten} aria-label={`${u.unit} zuklappen`} aria-expanded>
                      <IconChevronDown size={18} style={{ transform: 'rotate(180deg)' }} />
                    </UnstyledButton>
                  )}
                </Group>
              </Group>
              <div className="vp-pfad">
                {u.stufen.map(({ s, i, stufe, fuellung }) => (
                  <div key={s.key} className="vp-schritt">
                    <div className="vp-stueck" aria-hidden>
                      <div className="vp-fuell" style={{ '--f': s.frei || stufe !== 'offen' ? fuellung : 0 } as React.CSSProperties} />
                    </div>
                    <Wegpunkt s={s} stufe={stufe} hier={i === figur} vorher={weg.stufen[i - 1]} fertig={fertig} />
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </Stack>
    </div>
  )
}

/** Ein Wegpunkt mit kleiner Auskunft beim Antippen – nur zum Ansehen */
function Wegpunkt({ s, stufe, hier, vorher, fertig }: { s: Stufe; stufe: WegStufe; hier: boolean; vorher?: Stufe; fertig: boolean }): React.JSX.Element {
  const z = stationZahlen(s)
  const gesperrt = !s.frei && stufe === 'offen'
  const klasse = gesperrt ? 'gesperrt' : stufe
  const fehlen = fehlenBis(s)
  const stand =
    stufe === 'abgeschlossen'
      ? 'Abgeschlossen – Stern und Fähnchen!'
      : gesperrt
        ? vorher
          ? `Noch gesperrt – frei wird es, wenn ${vorher.unit} · ${vorher.section} abgeschlossen ist.`
          : 'Noch gesperrt.'
        : stufe === 'gelernt'
          ? `Alle Wörter kennengelernt (halber Stern). Noch ${woerter(fehlen)} sicher genug bis zum ganzen Stern.`
          : `Noch ${woerter(fehlen)} sicher genug bis zum Stern.`
  return (
    <div className="vp-punkt">
      {hier && (
        <span className="vp-figur" data-vp-figur>
          <Eule pose={fertig ? 'jubelt' : 'winkt'} groesse={44} />
        </span>
      )}
      <Popover width={250} position="bottom" withArrow shadow="md">
        <Popover.Target>
          <button
            type="button"
            className={`vp-knoten ${klasse}${hier ? ' hier' : ''}`}
            aria-label={`${s.unit} · ${s.section}: ${z.kennengelernt} von ${z.gesamt} kennengelernt, ${z.fach2plus} sicher genug${gesperrt ? ', gesperrt' : ''}`}
            data-vp-punkt={s.key}
            data-vp-stufe={klasse}
            {...(hier ? { 'data-vp-hier': '' } : {})}
          >
            {stufe === 'abgeschlossen' ? (
              <>
                <IconStarFilled size={24} />
                <IconFlag3Filled size={18} className="vp-fahne" />
              </>
            ) : stufe === 'gelernt' ? (
              <IconStarHalfFilled size={24} className="vp-stern" />
            ) : gesperrt ? (
              <IconLock size={18} />
            ) : (
              kurz(s.section)
            )}
          </button>
        </Popover.Target>
        <Popover.Dropdown data-vp-auskunft={s.key}>
          <Text size="sm" fw={700}>
            {s.unit} · {s.section}
          </Text>
          <Text size="xs" c="dimmed" mb={4}>
            {woerter(z.gesamt)}
          </Text>
          <Text size="sm">
            {z.kennengelernt} von {z.gesamt} kennengelernt · {z.fach2plus} sicher genug
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {stand}
          </Text>
        </Popover.Dropdown>
      </Popover>
      <div className="vp-name">{s.section}</div>
    </div>
  )
}
