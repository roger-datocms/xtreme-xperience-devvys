/**
 * Call recording for the DatoCMS debug panel (src/components/datocms-debug-panel).
 * The SDK calls `getDatoDebugSession()`, which returns null unless DATOCMS_DEBUG_PANEL=true.
 */
import { cache } from 'react'
import { type Client, _makeClient } from './client'
import { initLogger } from '../logger'

/** One DatoCMS request made while rendering a page. */
export type DatoDebugCall = {
  operation: string
  /** `network` reached DatoCMS (billed); `next-cache` came from the Next.js data cache. */
  source: 'network' | 'next-cache'
  ms: number
  bytes: number
  environmentSent: string | null
  environmentResolved: string | null
  cdnCache: string | null
  /** For `next-cache` answers: how long ago DatoCMS sent the cached response. */
  dataAgeMs: number | null
  errors: string[]
}

export type DatoDebugCollector = {
  calls: DatoDebugCall[]
  pending: number
  lastChangeAt: number
}

/** Next.js refuses to store data cache entries over 2 MB, so those refetch on every render. */
export const NEXT_DATA_CACHE_LIMIT_BYTES = 2 * 1024 * 1024
/** The panel waits until no DatoCMS call has started or finished for this long. */
const QUIET_MS = 300
const MAX_WAIT_MS = 15_000

/** The panel and call recording run only when DATOCMS_DEBUG_PANEL is exactly "true". */
export const isDatoDebugEnabled = (): boolean => process.env.DATOCMS_DEBUG_PANEL === 'true'

/** One collector per server render, scoped by React `cache()`. */
export const getDatoDebugCollector = cache((): DatoDebugCollector => ({ calls: [], pending: 0, lastChangeAt: Date.now() }))

/**
 * One urql client per server render. The app's shared client merges identical in-flight queries
 * across concurrent renders, so one render's panel would otherwise show another render's calls.
 */
const getRenderClient = cache(() => _makeClient({ logger: initLogger() }))

/**
 * Whether Next.js answered from its data cache. On a hit, Next defines a fixed (non-configurable)
 * `url` on the response it builds. Network responses keep the prototype's `url`, or get a
 * configurable copy when Next clones them. This relies on Next 15 internals (server/lib/patch-fetch,
 * clone-response). If those change, hits count as network calls, so the panel over-reports.
 */
const isNextDataCacheHit = (response: Response): boolean =>
  Object.getOwnPropertyDescriptor(response, 'url')?.configurable === false

const isObject = (value: unknown): value is object => value !== null && typeof value === 'object'

const operationName = (init?: RequestInit): string => {
  try {
    const body: unknown = JSON.parse(String(init?.body))
    const query = isObject(body) && 'query' in body ? body.query : null
    return typeof query === 'string' ? (query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'anonymous') : 'anonymous'
  } catch {
    return 'unknown'
  }
}

/** GraphQL error messages from a response body. DatoCMS sends them with HTTP 200. */
const errorMessages = (text: string): string[] => {
  if (!text.includes('"errors"')) {
    return []
  }
  try {
    const body: unknown = JSON.parse(text)
    const errors = isObject(body) && 'errors' in body ? body.errors : null
    return Array.isArray(errors)
      ? errors.map((error: unknown) => (isObject(error) && 'message' in error ? String(error.message) : 'Unknown error'))
      : []
  } catch {
    return ['Unparseable error response']
  }
}

/** A fetch that records each call into `collector`, then returns the response unchanged. */
const createRecordingFetch = (collector: DatoDebugCollector): typeof fetch => {
  const recordingFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = Date.now()
    try {
      // The global fetch is Next's patched one, so the data cache still applies.
      const response = await globalThis.fetch(input, init)
      try {
        const text = await response.clone().text()
        const isCacheHit = isNextDataCacheHit(response)
        // A cached response keeps DatoCMS's original Date header.
        const servedAt = Date.parse(response.headers.get('date') ?? '')
        collector.calls.push({
          operation: operationName(init),
          source: isCacheHit ? 'next-cache' : 'network',
          dataAgeMs: isCacheHit && !Number.isNaN(servedAt) ? Math.max(0, startedAt - servedAt) : null,
          ms: Date.now() - startedAt,
          bytes: Buffer.byteLength(text),
          environmentSent: new Headers(init?.headers).get('x-environment'),
          environmentResolved: response.headers.get('x-environment'),
          cdnCache: response.headers.get('cf-cache-status'),
          errors: errorMessages(text)
        })
      } catch {
        // Recording is best effort.
      }
      return response
    } finally {
      collector.lastChangeAt = Date.now()
    }
  }
  return Object.assign(recordingFetch, {
    // Bun's typings add preconnect to fetch; forward it so the wrapper keeps fetch's type.
    preconnect: (...args: Parameters<typeof fetch.preconnect>) => globalThis.fetch.preconnect(...args)
  })
}

/**
 * For the SDK requester: with the panel on, returns this render's client, the operation context
 * that records calls, and a tracker that marks the query pending. Returns null with the panel off.
 * Call it where the query starts: urql's pipeline can run fetch outside the render's context.
 */
export const getDatoDebugSession = (): {
  client: Client
  context: { fetch: typeof fetch }
  track: <T>(query: Promise<T>) => Promise<T>
} | null => {
  if (!isDatoDebugEnabled()) {
    return null
  }
  const collector = getDatoDebugCollector()
  return {
    client: getRenderClient(),
    context: { fetch: createRecordingFetch(collector) },
    track: async (query) => {
      collector.pending++
      collector.lastChangeAt = Date.now()
      try {
        return await query
      } finally {
        collector.pending--
        collector.lastChangeAt = Date.now()
      }
    }
  }
}

/** Waits until the render has made no DatoCMS calls for a short while, so the panel lists them all. */
export const waitForDatoCalls = async (collector: DatoDebugCollector): Promise<void> => {
  const deadline = Date.now() + MAX_WAIT_MS
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  while (Date.now() < deadline && (collector.pending > 0 || Date.now() - collector.lastChangeAt < QUIET_MS)) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
