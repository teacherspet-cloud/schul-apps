/** `os` für die iPad-App */
export const tmpdir = (): string => '/tmp'
export const homedir = (): string => '/documents'
export const platform = (): string => 'ios'
export const networkInterfaces = (): Record<string, never[]> => ({})
export const EOL = '\n'
export default { tmpdir, homedir, platform, networkInterfaces, EOL }
