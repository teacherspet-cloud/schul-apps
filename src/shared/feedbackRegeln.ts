/**
 * Gemeinsame Bewertungsregeln für das KI-Feedback (27.11.2026, abgestimmt mit der Lehrkraft).
 *
 * Eigenwissen: Befund „Cars in the Lion City" (Essay über Singapur mit Übertrag auf Deutschland). Plausible Aussagen
 * aus Allgemeinwissen („in rural areas public transport is limited", „Germany is much bigger") wurden rot als „nicht
 * durch M1 belegt" markiert. Entscheidung: Eigenwissen und plausible Annahmen sind zulässig; gerügt wird nur, was dem
 * Material widerspricht oder sachlich falsch bzw. unplausibel ist.
 *
 * Spanisch: Fragen und Ausrufe brauchen das umgekehrte Anfangszeichen (¿ … ? / ¡ … !) – Regel der RAE
 * (Ortografía de la lengua española 2010, Kap. III, „signos dobles"). Belegt; die Gewichtung als Fehler ist Faustregel.
 */

export const EIGENWISSEN_REGEL =
  '- EIGENES WISSEN UND PLAUSIBLE ANNAHMEN: Aussagen ÜBER DAS MATERIAL (was dort steht, Zahlen, Fakten zum Thema des Materials) müssen zum Material passen – ' +
  'widerspricht eine Aussage dem Material oder gibt sie es falsch wieder, ist das ein Fehler. Darüber hinaus darf die Person Allgemeinwissen, eigene Erfahrungen und ' +
  'realistische Vermutungen einbringen – vor allem bei Vergleich, Übertragung auf andere Länder oder das eigene Umfeld, Beurteilung, Stellungnahme und Diskussion ' +
  '(Anforderungsbereich II/III). Solche Aussagen sind KEIN Mangel und werden NIE mit „nicht im Material belegt" o. Ä. gerügt oder rot markiert. Rüge sie nur, wenn sie ' +
  'sachlich falsch oder klar unplausibel sind (dann sachlich begründen). Steht in der Erwartung „mit Fakten aus dem Material belegt", gilt das für die Aussagen über das ' +
  'Material – nicht für die eigene Einschätzung und das Weltwissen, mit dem die Person sie begründet. Eine plausible Folgerung („weniger Autos → weniger Abgase") ist ' +
  'eine zulässige Begründung, auch wenn das Material sie nicht ausdrücklich nennt.'

export const SPANISCH_ZEICHEN_KORREKTUR =
  '- SPANISCHE ZEICHENSETZUNG: Fragen und Ausrufe beginnen im Spanischen mit dem umgekehrten Zeichen (¿Dónde vives? ¡Qué bien!), auch mitten im Satz ' +
  '(Si llueve, ¿vienes?). Fehlt das Anfangszeichen oder steht es falsch, ist das ein Zeichensetzungsfehler (eigene Markierung mit Verbesserung). Nur auf spanische' +
  ' Sätze der Antwort anwenden, nie auf deutsche.'

/** Für erzeugtes spanisches Material (Arbeitsblatt, Test, Lösung) */
export const SPANISCH_ZEICHEN_ERZEUGUNG =
  'Spanische Zeichensetzung: Jede spanische Frage beginnt mit „¿" und endet mit „?", jeder Ausruf beginnt mit „¡" und endet mit „!" – auch in Aufgaben, Beispielsätzen, ' +
  'Lösungen und mitten im Satz (Si llueve, ¿vienes?). Kein Leerzeichen nach ¿/¡ und keins vor ?/!. Die Zeichen gehören nur in spanische Sätze, nicht in deutsche Anweisungen.'

/** Regel für die Erzeugung, nur im Fach Spanisch (sonst leer) */
export const spanischeZeichenRegel = (fachId: string | undefined): string => (fachId === 'spanisch' ? `- ${SPANISCH_ZEICHEN_ERZEUGUNG}` : '')
