/**
 * Änderungswunsch an einen Hörtext des Arbeitsblatts als Hintergrund-Auftrag (01.10.2026).
 *
 * Wie beim Überarbeiten eines Bausteins (auftraege.ts › bausteinAuftrag): Der Auftrag arbeitet
 * mit einer Kopie des Blattes vom Start und legt das Ergebnis im SELBEN Blatt ab. Anders als
 * dort ändert er mehrere Bausteine – das Skript und die Aufgaben dazu – und zwar in EINEM
 * Schritt, damit Strg+Z alles zusammen zurücknimmt. Der Ablauf selbst steht in
 * generation/hoertextWunsch.ts und gilt für alle Programme mit Hörtexten.
 */
import { starteAuftrag } from '../../shared/auftraege'
import type { WunschArt } from '../../shared/kiWunsch'
import { notifySuccess } from '../../shared/util'
import type { LearnerProfile } from './didactics/profile'
import { hoertextWunschAusfuehren, wendeHoertextWunschAn } from './generation/hoertextWunsch'
import { blattOffen, legeArbeitsblattAb } from './library'
import type { Worksheet } from './model/types'

export function hoertextWunschAuftrag(worksheet: Worksheet, docId: string, audioId: string, art: WunschArt, wunsch: string, profile: LearnerProfile): void {
  void starteAuftrag({
    moduleId: 'arbeitsblatt',
    docId,
    titel: worksheet.meta.title.trim() || worksheet.meta.topic.trim() || 'Arbeitsblatt',
    art: art === 'neu' ? 'Hörtext neu schreiben' : 'Hörtext überarbeiten',
    eingabe: worksheet,
    istOffen: () => blattOffen(docId),
    sperrt: false,
    // Dieselbe Kennung wie beim Baustein: Zauberstab und Kreis drehen, solange es läuft
    schluessel: audioId,
    fehlerTitel: 'Der Hörtext konnte nicht überarbeitet werden',
    arbeit: (ws, k) =>
      hoertextWunschAusfuehren({ listen: ws.sheets.map((s) => s.blocks), audioId, art, wunsch, meta: ws.meta, profile, ai: k.ai, melde: (t) => k.melde(t) }),
    abschluss: (erg) => erg.zusammenfassung,
    ablegen: async (erg, ws) => {
      await legeArbeitsblattAb(docId, ws, (aktuell) => ({
        ...aktuell,
        sheets: aktuell.sheets.map((s, i) => ({ ...s, blocks: wendeHoertextWunschAn(s.blocks, audioId, erg.skript, erg.anpassungen[i]?.bloecke ?? new Map()) }))
      }))
      notifySuccess(erg.zusammenfassung)
    }
  })
}
