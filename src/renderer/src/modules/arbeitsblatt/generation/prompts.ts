// Aufgeteilt in prompts/ (Großprogramm 0.4, Aufräumen D4); diese Datei reicht die bisherigen Exporte weiter.
export { SHEET_TYPES, sheetTypePrompt, systemPrompt, wantedTasks, taskCountRules } from './prompts/grundregeln'
export {
  SKILL_FOCUS,
  skillFocusOptions,
  helpCardRules,
  skillFocusPrompt,
  loesungsspracheRegel,
  phraseSheetModus,
  phraseSheetRules,
  writingScaffoldRules,
  grammarRules
} from './prompts/fertigkeiten'
export { comprehensionRules, mcItemRules, itemWordingRules, singleTaskFocus, taskContext } from './prompts/aufgaben'
export {
  SOURCE_SUBJECTS,
  originalSourcesActive,
  originalSourcesHint,
  originalSourceRules,
  originalMaterialVorgabe,
  materialText,
  materialImages,
  embeddableImages,
  MATERIAL_WARN_CHARS
} from './prompts/quellen'
export { imageRules, learningDesignRules, scaffoldRules, operatorRules, subjectMethodRules, gridRules } from './prompts/gestaltung'
export {
  writingWords,
  STUDENT_WORDS,
  MATERIAL_WORDS,
  sourceTextWords,
  contextRules,
  STUDENT_TEXT_TYPES,
  studentTextTypeRule,
  writingBriefRules,
  umfangRegeln,
  wordLimitRule
} from './prompts/schreiben'
export { listeningTextRules, languageSkillRules, videoRules } from './prompts/sprache'
