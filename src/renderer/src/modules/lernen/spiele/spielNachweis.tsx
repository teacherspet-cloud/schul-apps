/**
 * Bildnachweis im Spiel (23.10.2026, Bildnachweise): kleines ⓘ in der Ecke des Bildes, ohne das gesuchte Wort und
 * seine Übersetzung (shared/bildLizenz.ts `nachweisOhneLoesung`); die volle Angabe kommt in die Liste „Bildnachweise“
 * am Ende der Runde (Spiele.tsx, `BildNachweisSammler`). Das umgebende Element braucht `position: relative`.
 */
import type { Vokabel } from '@shared/vokabeltrainer'
import { spielform } from '@shared/vokabelSpiele'
import { BildNachweis } from '../../../shared/components/BildNachweis'

export const spielNachweis = (v: Pick<Vokabel, 'bild' | 'bildNachweis' | 'term' | 'translation'>): React.ReactNode =>
  v.bild && v.bildNachweis ? <BildNachweis kompakt text={v.bildNachweis} loesung={[v.term, spielform(v.term), v.translation]} label={spielform(v.term)} /> : null
