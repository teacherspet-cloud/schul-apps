import { createContext, useContext } from 'react'
import type { WsBlock } from '../model/types'
import type { Stars } from '../didactics/differentiation'

/** edit = Schülerblatt bearbeiten, keyEdit = Lösungen bearbeiten, print/key = Druckansichten */
export type WsMode = 'edit' | 'print' | 'key' | 'keyEdit' | 'measure'

export interface WsActions {
  /** Bild wählen; bei Bildreihen für ein Einzelbild */
  pickImage?: (blockId: string, itemId?: string) => void
}

export interface WsContextValue {
  mode: WsMode
  update?: (blockId: string, fn: (draft: WsBlock) => void) => void
  actions?: WsActions
  /** Aufgabennummern je Baustein-ID */
  taskNumbers: Map<string, number>
  /** Materialnummern (M1, M2 …) je Baustein-ID – von der App vergeben */
  materialNumbers?: Map<string, string>
  /** Blatt enthält ★-markierte Aufgaben (gemeinsames Blatt) */
  showStars: boolean
  /** Niveaustufe DIESES Blattes bei getrennten Blättern – steuert u. a. die Übersetzungen */
  sheetStars?: Stars
  /** Korrekturrand neben den Schreiblinien */
  correctionMargin?: boolean
  /** Notizrand neben den Materialtexten */
  notesMargin?: boolean
  /**
   * Stehen im Hilfsblatt deutsche Entsprechungen neben den Wendungen?
   *
   * Entschieden wird das einmal in `contextFor` aus Niveau und ★-Stufe (siehe
   * `didactics/phraseRules.ts`); die Darstellung bekommt nur noch das Ergebnis.
   */
  phraseGerman?: boolean
  /** Aufgaben, bei denen eine neue Phase der Filmbeobachtung beginnt */
  phaseStarts?: Set<string>
  /** Zeitmarken auch auf dem Schülerblatt zeigen (Vorgabe: nein) */
  showTimecodes?: boolean
  /** Längere Texte im Blocksatz setzen */
  justify?: boolean
  /** Breite der Textspalte in mm (für Gitternetze, die auf dem Papier stimmen müssen) */
  contentWidthMm?: number
  /** Operatoren fett, Symbole für Sozialformen, Nummernstil, Piktogramme an den Anweisungen */
  taskStyle: { numberStyle: 'circle' | 'square' | 'plain'; showSocialFormIcons: boolean; pictograms?: boolean }
  /**
   * Sprache der festen Beschriftungen in den Aufgaben (z. B. richtig/falsch).
   * In den Fremdsprachen steht die Aufgabe in der Zielsprache – die Kästchen also auch.
   */
  answerLanguage?: string
  /** Fach des Blattes – entscheidet u. a. über die Regeln für Hörtexte */
  subjectId?: string
  /** Die Hörtexte liegen als Dateianlage im PDF – nur dann der Hinweis am Baustein */
  audioAttached?: boolean
  /**
   * Nennt das Blatt den Lernenden die erwartete Wortzahl?
   *
   * Die Einstellung gilt fuer das ganze Blatt (Schritt 1) und muss auch fuer die Vorgaben
   * einer Schreibaufgabe gelten – sonst steht die Wortzahl doch wieder da, nur an anderer
   * Stelle als in der Arbeitsanweisung.
   */
  wordLimit?: boolean
}

export const WsContext = createContext<WsContextValue>({
  mode: 'print',
  taskNumbers: new Map(),
  showStars: false,
  taskStyle: { numberStyle: 'circle', showSocialFormIcons: true }
})

export const useWs = (): WsContextValue => useContext(WsContext)

export const isKeyMode = (mode: WsMode): boolean => mode === 'key' || mode === 'keyEdit'
export const isEditMode = (mode: WsMode): boolean => mode === 'edit' || mode === 'keyEdit'
