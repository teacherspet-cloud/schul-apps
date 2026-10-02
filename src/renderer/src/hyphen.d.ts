/** Silbentrennung (shared/silbentrennung.ts): Paket „hyphen" bringt keine eigenen Typen mit */
declare module 'hyphen/*' {
  export function hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number; exceptions?: string[] }): string
}
