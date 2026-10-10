/**
 * Erlaubte Felder der Darstellung der Lernenden (/s/api/darstellung) – aus http.ts herausgelöst (09.10.2026), damit
 * die Liste prüfbar ist (tests/willkommen.test.ts). Was hier nicht steht, wird nicht gespeichert.
 *
 * „willkommenErledigt" (09.10.2026, Willkommens-Assistent): bleibt gesetzt, wenn es einmal gesetzt ist. Andere Stellen
 * (Spiele, Regal …) schicken die ganze Darstellung aus der Kopie im Browser; ein Gerät mit älterer Kopie ohne das Feld
 * würde den Assistenten sonst wieder erscheinen lassen. Er erscheint so nur einmal je Konto – nicht je Gerät.
 */
import { FARB_WERTE } from '../shared/schuelerFarben'

export function darstellungPruefen(k0: Record<string, unknown>, alt?: Record<string, unknown> | null): Record<string, unknown> {
  const wahl = (wert: unknown, erlaubt: string[], vorgabe: string): string => (erlaubt.includes(String(wert)) ? String(wert) : vorgabe)
  return {
    modus: wahl(k0.modus, ['hell', 'dunkel', 'auto'], 'auto'),
    schrift: wahl(k0.schrift, ['normal', 'gross', 'sehrgross'], 'normal'),
    farbe: wahl(k0.farbe, FARB_WERTE, 'blue'),
    ruhig: k0.ruhig === true,
    // Vokabeltraining: Fachfarbe oder eigene Farbe (03.10.2026)
    design: wahl(k0.design, ['fach', 'eigen'], 'fach'),
    // Lesen und Hören, Lernen (06.10.2026). Die lesefreundliche Schrift und die Stimme bleiben nur auf dem Gerät
    // (keine Angaben, die nach Diagnose aussehen, auf dem Server; Stimmen gibt es je Gerät).
    zeilen: wahl(k0.zeilen, ['normal', 'weit', 'sehrweit'], 'normal'),
    kontrast: k0.kontrast === true,
    vorlesen: k0.vorlesen === true,
    tempo: wahl(k0.tempo, ['langsam', 'normal', 'schnell'], 'normal'),
    // Aufgenommene Aussprache: weibliche oder männliche Fassung (07.10.2026)
    aussprache: wahl(k0.aussprache, ['w', 'm'], 'm'),
    wochenziel: Math.max(1, Math.min(7, Math.round(Number(k0.wochenziel) || 3))),
    // Wochenziel ausdrücklich gewählt (10.10.2026) – dann entfällt der Tipp „Wochenziel festlegen"
    wochenzielGesetzt: k0.wochenzielGesetzt === true,
    tipps: k0.tipps !== false,
    spiele: k0.spiele !== false,
    zeitdruck: k0.zeitdruck !== false,
    toene: k0.toene !== false,
    // Neue Vorgaben vom 08.10.2026 (Töne an, männliche Stimme) schon übernommen – sonst würden sie die eigene Wahl überschreiben
    vorgabe0810: k0.vorgabe0810 === true,
    // Spielauswahl: auf- und zugeklappte Bereiche (08.10.2026)
    spielGruppen: Object.fromEntries(
      Object.entries(typeof k0.spielGruppen === 'object' && k0.spielGruppen ? (k0.spielGruppen as Record<string, unknown>) : {})
        .filter(([n, v]) => /^[a-z]{1,20}$/.test(n) && typeof v === 'boolean')
        .slice(0, 20)
    ),
    // „Lege das Wort": legen, tippen oder schreiben; Meine Materialien als Regal oder Liste, eigene Ordnerreihenfolge (08.10.2026)
    legen: wahl(k0.legen, ['legen', 'tippen', 'schreiben'], 'legen'),
    // „Dein Vokabelweg" auf- oder zugeklappt (08.10.2026)
    vokabelwegOffen: k0.vokabelwegOffen === true,
    // Sitzung, in der Spielbereiche und Vokabelweg auf-/zugeklappt wurden (09.10.2026): neue Anmeldung = wieder Vorgabe
    ...(typeof k0.offenSitzung === 'string' && /^[a-z0-9-]{1,80}$/.test(k0.offenSitzung) ? { offenSitzung: k0.offenSitzung } : {}),
    // Vollbild beim Lernen (09.10.2026): an, solange die Lernenden es nicht ausschalten
    vollbild: k0.vollbild !== false,
    materialien: wahl(k0.materialien, ['regal', 'liste'], 'regal'),
    regal: (Array.isArray(k0.regal) ? k0.regal : []).filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 60).slice(0, 40),
    // Willkommens-Assistent gesehen (09.10.2026) – einmal gesetzt, bleibt es (siehe oben)
    willkommenErledigt: k0.willkommenErledigt === true || alt?.willkommenErledigt === true
  }
}
