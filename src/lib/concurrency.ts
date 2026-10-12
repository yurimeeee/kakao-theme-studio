/**
 * Runs `fn` over `items` with at most `limit` calls in flight. Rejects with the first
 * error (calls already started still settle); results keep the input order.
 */
export async function mapLimit<T, R>(items: Iterable<T>, limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const list = [...items]
  const results = new Array<R>(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      results[i] = await fn(list[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), list.length) }, worker))
  return results
}
