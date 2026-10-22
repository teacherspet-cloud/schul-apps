/**
 * Datenpannen melden und dokumentieren (22.10.2026, Prüfung des Schulträgers, Punkt 12 – Art. 33/34 DSGVO).
 *
 *  - Art. 33 Abs. 1: Meldung an die Aufsichtsbehörde (Niedersachsen: Die Landesbeauftragte für den Datenschutz, LfD)
 *    binnen 72 Stunden, nachdem die Verletzung bekannt wurde – außer, sie führt voraussichtlich nicht zu einem Risiko.
 *  - Art. 33 Abs. 5: JEDE Verletzung wird dokumentiert (Fakten, Auswirkungen, Abhilfemaßnahmen) – auch die nicht
 *    gemeldeten. Deshalb bleibt die Liste vergangener Vorfälle in der Verwaltung stehen.
 *  - Art. 34: Betroffene benachrichtigen, wenn voraussichtlich ein HOHES Risiko besteht.
 * Reine Regeln ohne Abhängigkeiten (Server, Oberfläche und Tests teilen sie).
 */

export const FRIST_MS = 72 * 3600 * 1000

/** Online-Meldeformular der LfD Niedersachsen */
export const LFD_ADRESSE = 'https://lfd.niedersachsen.de'

export type PannenRisiko = 'kein' | 'risiko' | 'hoch'

export const RISIKO_TEXT: Record<PannenRisiko, string> = {
  kein: 'Voraussichtlich kein Risiko (nur dokumentieren)',
  risiko: 'Risiko für die Betroffenen (Meldung an die LfD)',
  hoch: 'Hohes Risiko (Meldung an die LfD und Benachrichtigung der Betroffenen)'
}

export const CHECKLISTE = [
  { id: 'schulleitung', text: 'Schulleitung informieren' },
  { id: 'dsb', text: 'Datenschutzbeauftragte(n) der Schule informieren' },
  { id: 'lfd', text: 'Meldung an die LfD Niedersachsen (Online-Formular, binnen 72 Stunden)' },
  { id: 'betroffene', text: 'Betroffene benachrichtigen (bei hohem Risiko, Art. 34 DSGVO)' },
  { id: 'dokumentiert', text: 'Vorfall, Auswirkungen und Maßnahmen dokumentieren (Art. 33 Abs. 5 DSGVO)' }
] as const

export type CheckPunkt = (typeof CHECKLISTE)[number]['id']

/** Inhalt eines Vorfalls – liegt verschlüsselt (feldschutz.ts SENSIBEL `datenpannen.daten`). */
export interface PannenDaten {
  /** Was ist passiert? */
  was: string
  /** Wann ist es passiert (falls bekannt, freier Text) */
  wannPassiert?: string
  /** Betroffene Datenarten (z. B. Namen, Noten, Zugangsdaten) */
  datenarten: string
  /** Anzahl betroffener Personen (ungefähr) */
  personen: number
  /** Anzahl betroffener Datensätze (ungefähr) */
  datensaetze: number
  /** Ergriffene und geplante Maßnahmen */
  massnahmen: string
  risiko: PannenRisiko
  /** Erledigte Punkte der Checkliste mit Zeitpunkt */
  erledigt: Partial<Record<CheckPunkt, number>>
  /** Wer hat angelegt (Anzeigename) */
  von?: string
  /** Begründung, falls nicht gemeldet wurde (Art. 33 Abs. 5) */
  ohneMeldungGrund?: string
}

export interface Datenpanne extends PannenDaten {
  id: string
  /** Zeitpunkt der Entdeckung (ms) – ab hier laufen die 72 Stunden */
  entdeckt: number
  erstellt: number
  abgeschlossen?: number
}

const text = (x: unknown, max: number): string =>
  String(x ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max)
const zahl = (x: unknown): number => {
  const n = Math.floor(Number(x))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10_000_000) : 0
}

/** Eingaben prüfen und bereinigen; Fehlertext oder bereinigte Daten. */
export function pannePruefen(roh: Record<string, unknown>, jetzt = Date.now()): { fehler: string } | { entdeckt: number; daten: PannenDaten } {
  const was = text(roh.was, 4000)
  if (was.length < 5) return { fehler: 'Bitte beschreiben, was passiert ist.' }
  const entdeckt = Number(roh.entdeckt)
  if (!Number.isFinite(entdeckt) || entdeckt <= 0) return { fehler: 'Bitte angeben, wann die Panne entdeckt wurde.' }
  // Kleine Uhrabweichung erlaubt, Zukunft nicht
  if (entdeckt > jetzt + 5 * 60_000) return { fehler: 'Der Zeitpunkt der Entdeckung liegt in der Zukunft.' }
  const risiko: PannenRisiko = roh.risiko === 'kein' || roh.risiko === 'hoch' ? roh.risiko : 'risiko'
  const erledigt: Partial<Record<CheckPunkt, number>> = {}
  const e = (roh.erledigt ?? {}) as Record<string, unknown>
  for (const c of CHECKLISTE) {
    const t = Number(e[c.id])
    if (Number.isFinite(t) && t > 0) erledigt[c.id] = t
  }
  return {
    entdeckt,
    daten: {
      was,
      ...(text(roh.wannPassiert, 200) ? { wannPassiert: text(roh.wannPassiert, 200) } : {}),
      datenarten: text(roh.datenarten, 1000),
      personen: zahl(roh.personen),
      datensaetze: zahl(roh.datensaetze),
      massnahmen: text(roh.massnahmen, 4000),
      risiko,
      erledigt,
      ...(text(roh.von, 120) ? { von: text(roh.von, 120) } : {}),
      ...(text(roh.ohneMeldungGrund, 1000) ? { ohneMeldungGrund: text(roh.ohneMeldungGrund, 1000) } : {})
    }
  }
}

/** Stand der 72-Stunden-Frist ab der Entdeckung. */
export function fristStand(entdeckt: number, jetzt = Date.now()): { bis: number; restMs: number; abgelaufen: boolean; text: string; dringend: boolean } {
  const bis = entdeckt + FRIST_MS
  const restMs = bis - jetzt
  const abgelaufen = restMs <= 0
  const ms = Math.abs(restMs)
  const std = Math.floor(ms / 3_600_000)
  const min = Math.floor((ms % 3_600_000) / 60_000)
  const dauer = `${std} Std. ${String(min).padStart(2, '0')} Min.`
  return { bis, restMs, abgelaufen, dringend: !abgelaufen && restMs < 12 * 3_600_000, text: abgelaufen ? `Frist seit ${dauer} abgelaufen` : `noch ${dauer}` }
}

/** Welche Punkte der Checkliste sind bei diesem Risiko nötig? (Betroffene nur bei hohem, LfD nicht bei „kein Risiko“) */
export function noetigePunkte(risiko: PannenRisiko): CheckPunkt[] {
  return CHECKLISTE.map((c) => c.id).filter((id) => (id === 'betroffene' ? risiko === 'hoch' : id === 'lfd' ? risiko !== 'kein' : true))
}

/** Offen = ein nötiger Punkt fehlt noch. */
export function offenePunkte(p: Pick<PannenDaten, 'risiko' | 'erledigt'>): CheckPunkt[] {
  return noetigePunkte(p.risiko).filter((id) => !p.erledigt[id])
}

const datumZeit = (ms: number): string =>
  new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Vorbefüllter Text für das Online-Formular der LfD (Gliederung nach Art. 33 Abs. 3 DSGVO). Wird kopiert oder gedruckt;
 * gesendet wird nichts automatisch.
 */
export function lfdMeldetext(p: Datenpanne, schule: { name?: string; ort?: string; kontakt?: string } = {}): string {
  const zeilen = [
    'Meldung einer Verletzung des Schutzes personenbezogener Daten nach Art. 33 DSGVO',
    '',
    `Verantwortliche Stelle: ${[schule.name, schule.ort].filter(Boolean).join(', ') || '(Name und Anschrift der Schule ergänzen)'}`,
    `Ansprechperson / Datenschutzbeauftragte(r): ${schule.kontakt || '(Name, Telefon, E-Mail ergänzen)'}`,
    '',
    '1. Art der Verletzung (Art. 33 Abs. 3 lit. a)',
    p.was,
    p.wannPassiert ? `Zeitpunkt des Vorfalls: ${p.wannPassiert}` : 'Zeitpunkt des Vorfalls: unbekannt',
    `Entdeckt am: ${datumZeit(p.entdeckt)}`,
    `Betroffene Datenarten: ${p.datenarten || '(ergänzen)'}`,
    `Ungefähre Zahl der betroffenen Personen: ${p.personen}`,
    `Ungefähre Zahl der betroffenen Datensätze: ${p.datensaetze}`,
    '',
    '2. Wahrscheinliche Folgen (lit. c)',
    RISIKO_TEXT[p.risiko],
    '',
    '3. Ergriffene oder vorgeschlagene Maßnahmen (lit. d)',
    p.massnahmen || '(ergänzen)',
    '',
    `4. Benachrichtigung der Betroffenen (Art. 34): ${p.erledigt.betroffene ? `erfolgt am ${datumZeit(p.erledigt.betroffene)}` : p.risiko === 'hoch' ? 'geplant' : 'nicht erforderlich (kein hohes Risiko)'}`
  ]
  if (fristStand(p.entdeckt, p.erstellt).abgelaufen || fristStand(p.entdeckt).abgelaufen)
    zeilen.push('', '5. Gründe für eine Meldung nach Ablauf von 72 Stunden (Art. 33 Abs. 1 Satz 2)', '(Gründe der Verzögerung ergänzen)')
  return zeilen.join('\n')
}
