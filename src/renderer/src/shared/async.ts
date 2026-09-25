/** Führt Aufgaben parallel aus, aber höchstens `limit` gleichzeitig; Reihenfolge der Ergebnisse bleibt erhalten. */
export async function runLimited<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const i = next++
      results[i] = await jobs[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker))
  return results
}
