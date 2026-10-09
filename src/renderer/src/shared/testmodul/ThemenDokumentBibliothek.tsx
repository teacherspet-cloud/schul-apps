import { Badge, Button, Container, ScrollArea } from '@mantine/core'
import { IconCopy, IconFilePlus, IconFolderOpen, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SavedDokumentMeta } from '@shared/apiShape'
import { BibliothekKopf, EintragMenue, EintragRueckfragen, useBibliothek, type BibliotheksApi } from '../components/Bibliothek'
import { ThemenBibliothek, type VorschauInhalt } from '../components/ThemenBibliothek'
import { fachIdVon } from '../fachfarben'
import { nurPcNetz } from '../plattform'
import { ReiheMarke } from '../reiheZuordnung'
import type { ThemenEintrag } from '../themenBibliothek'
import { ladeThemen, themenbereichVon, themenbereichVonHand, useThemen } from '../themenbereiche'
import { fachSchluessel } from '../../shell/materialien'
import { obersterBereich } from '@shared/themen'
import WischZeile from '../touch/WischZeile'
import { notifyError } from '../util'
import type { BibliotheksSeiteProps } from './ZweiSchrittModul'

/** Ein gespeichertes Dokument als Eintrag der Themen-Bibliothek */
type DokEintrag = ThemenEintrag & { meta: SavedDokumentMeta }

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Themenbereich eines gespeicherten Dokuments setzen (09.10.2026): im Dokument (`meta.themenbereich`)
 * und im Verzeichnis (stats). Ist es gerade offen, auch im Store – sonst schriebe das automatische
 * Speichern den alten Stand zurück. `null` = wieder automatisch.
 */
export async function themenbereichSpeichern(
  api: BibliotheksApi<SavedDokumentMeta>,
  id: string,
  name: string | null,
  imOffenen?: (id: string, name: string | null) => void
): Promise<void> {
  imOffenen?.(id, name)
  const { id: _id, name: titel, createdAt: _c, updatedAt: _u, payload, thumb, ...stats } = await api.get(id)
  const p = (payload ?? {}) as { meta?: Record<string, unknown> }
  const meta = { ...(p.meta ?? {}) }
  const s: Record<string, unknown> = { ...stats }
  if (name === null) {
    delete meta.themenbereich
    delete s.themenbereich
  } else {
    meta.themenbereich = name
    s.themenbereich = name
  }
  await api.save({ id, name: titel, stats: s, payload: { ...p, meta }, ...(thumb ? { thumb } : {}) })
}

/**
 * Bibliothek der Dokument-Programme mit Themenbereichen (09.10.2026: Tafelbilder, Rückmeldungen):
 * Kopf, Suche, Umbenennen, Kopie, Löschen und Unterrichtsreihen-Schalter wie in EinfacheBibliothek
 * (shared/components/Bibliothek), die Liste selbst ist die ThemenBibliothek.
 */
export default function ThemenDokumentBibliothek({
  props,
  api,
  moduleId,
  titel,
  einzahl,
  mehrzahl,
  neuText,
  symbol,
  offeneId,
  umbenannt,
  geloescht,
  oeffnen,
  imOffenen,
  kennzeichen,
  info,
  vorschau,
  quelleBereich
}: {
  props: BibliotheksSeiteProps
  api: BibliotheksApi<SavedDokumentMeta>
  moduleId: string
  titel: string
  einzahl: string
  mehrzahl: string
  neuText: string
  symbol: ReactNode
  offeneId: () => string
  umbenannt: (m: SavedDokumentMeta) => void
  geloescht: () => void
  oeffnen: (id: string) => Promise<void>
  /** Themenbereich im offenen Dokument nachführen */
  imOffenen: (id: string, name: string | null) => void
  kennzeichen?: (m: SavedDokumentMeta) => ReactNode
  info?: (m: SavedDokumentMeta) => string[]
  vorschau?: (m: SavedDokumentMeta) => (() => Promise<VorschauInhalt>) | undefined
  /** Material, aus dem das Dokument stammt (moduleId, id) – dessen Themenbereich gilt als Vorgabe */
  quelleBereich?: (m: SavedDokumentMeta) => { moduleId: string; id: string } | null
}): React.JSX.Element {
  const bib = useBibliothek<SavedDokumentMeta>(api, { offeneId, umbenannt, geloescht, moduleId })
  const offen = offeneId()
  const [menueOffen, setMenueOffen] = useState<string | null>(null)
  const themen = useThemen((s) => s.daten)
  useEffect(() => {
    void ladeThemen().catch(() => undefined)
  }, [])

  const eintraege = useMemo<DokEintrag[] | null>(() => {
    if (!bib.eintraege) return null
    const bereich = (mod: string, id: string): string => {
      const b = themenbereichVon(mod, id, themen)
      return b ? (obersterBereich(themen, b.id)?.name ?? b.name) : ''
    }
    return bib.eintraege.map((m) => {
      const fach = text(m.subjectLabel)
      const q = quelleBereich?.(m)
      return {
        id: m.id,
        titel: m.name,
        fach,
        fachId: text(m.subjectId) || fachIdVon(fach) || '',
        ...(m.grade ? { grade: m.grade } : {}),
        thema: text(m.thema),
        ueberthema: text(m.ueberthema),
        updatedAt: m.updatedAt,
        themenbereich: text(m.themenbereich),
        // Bereich aus den Themenbereichen der App: das Dokument selbst, sonst das Material, aus dem es stammt
        bereichVorgabe: bereich(moduleId, m.id) || (q ? bereich(q.moduleId, q.id) : ''),
        land: text(m.stateId),
        schulform: text(m.schoolTypeId),
        meta: m
      }
    })
  }, [bib.eintraege, themen, moduleId, quelleBereich])

  const auf = (e: DokEintrag): void => {
    if (e.id === offen && props.zurueck !== null) props.onZurueck()
    else oeffnen(e.id).then(props.onOpened).catch(notifyError)
  }
  const alle = bib.eintraege ?? []

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <BibliothekKopf
          titel={titel}
          untertitel={alle.length === 1 ? `${einzahl} gespeichert` : `${alle.length} ${mehrzahl} gespeichert`}
          zurueck={props.zurueck}
          onZurueck={props.onZurueck}
          suche={bib.suche}
          onSuche={bib.setSuche}
          suchHinweis="Name, Thema, Themenbereich, Fach, Klasse"
          reihe={bib.reihe}
        >
          <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={props.onOpenFile}>
            Datei öffnen …
          </Button>
          <Button leftSection={<IconFilePlus size={16} />} onClick={props.onNew}>
            {neuText}
          </Button>
        </BibliothekKopf>
        <ThemenBibliothek<DokEintrag>
          speicherSchluessel={moduleId}
          eintraege={eintraege}
          suche={bib.suche}
          symbol={symbol}
          oeffnen={auf}
          themenbereichSetzen={async (e, name) => {
            await themenbereichSpeichern(api, e.id, name, imOffenen)
            // Auch in den Themenbereichen der App (Startseite, Themenübersicht) – sonst zeigten sie den alten Bereich
            await themenbereichVonHand(moduleId, e.id, fachSchluessel(text(e.meta.subjectId) || text(e.meta.subjectLabel)), name).catch(() => undefined)
            bib.neuLaden()
          }}
          leerText={
            bib.reihe.anzahl > 0
              ? 'Hier steht bisher nur Material aus Unterrichtsreihen – oben einblenden.'
              : 'Noch nichts gespeichert – es wird automatisch gesichert, sobald etwas eingetragen ist.'
          }
          vorschau={vorschau ? (e) => vorschau(e.meta) : undefined}
          info={(e) => (info?.(e.meta) ?? [e.thema ?? '']).filter((x) => x && x !== e.titel)}
          kennzeichen={(e) => (
            <>
              {e.id === offen && props.zurueck !== null && (
                <Badge size="xs" variant="filled" color="gray">
                  geöffnet
                </Badge>
              )}
              {bib.neuId === e.id && (
                <Badge size="xs" variant="light" color="teal">
                  neu
                </Badge>
              )}
              {kennzeichen?.(e.meta)}
              {bib.reihe.verweis(e.id) && <ReiheMarke verweis={bib.reihe.verweis(e.id)!} size="xs" />}
            </>
          )}
          neu={(e) => bib.neuId === e.id}
          attribute={(e) => ({ 'data-bibliothek-eintrag': e.titel })}
          menue={(e, themenPunkt) => (
            <EintragMenue bib={bib} eintrag={e.meta} vorne={themenPunkt} offen={menueOffen === e.id} onOffen={(o) => setMenueOffen(o ? e.id : null)} />
          )}
          unten={(e) => <EintragRueckfragen bib={bib} eintrag={e.meta} />}
          huelle={(e, inhalt) => (
            <WischZeile
              aktionen={[
                { label: 'Kopie', icon: <IconCopy size={18} />, farbe: 'var(--mantine-color-blue-6)', onClick: () => void bib.kopieren(e.id) },
                ...(nurPcNetz() ? [] : [{ label: 'Löschen', icon: <IconTrash size={18} />, farbe: 'var(--mantine-color-red-6)', onClick: () => bib.setLoeschen(e.meta) }])
              ]}
              onLangerDruck={() => setMenueOffen(e.id)}
            >
              {inhalt}
            </WischZeile>
          )}
        />
      </Container>
    </ScrollArea>
  )
}
