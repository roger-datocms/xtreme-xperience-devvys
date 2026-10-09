'use client'

// Browser half of the DatoCMS debug panel. The server half, with the docs, is index.tsx.
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DatoDebugCall } from '../../core/dato/debug'

export type DatoDebugReport = {
  builtAt: number
  /** True when Next renders this page for its cache (static or ISR); null if unknown. */
  isCacheable: boolean | null
  /** The page's effective ISR revalidate time; null if never or unknown. */
  revalidateSeconds: number | null
  /** True when this render rebuilt a stale cached page in the background. */
  isRebuild: boolean | null
  label: string | null
  tone: 'red' | 'green' | null
  cacheLimitBytes: number
  calls: DatoDebugCall[]
}

type Props = { report: DatoDebugReport }

declare global {
  // Global augmentation needs an interface, which merges with the DOM's Window.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    __datoDebugClickAt?: number
    __datoDebugPageShownAt?: number
  }
}

/**
 * Records when a page's content appears. The panel times navigations to this moment,
 * not to its own mount, which waits for the DatoCMS calls to finish.
 */
export const DatoDebugPageShownMark = () => {
  useLayoutEffect(() => {
    window.__datoDebugPageShownAt = performance.now()
  }, [])
  return null
}

const COLORS = { red: '#b42318', green: '#067647', amber: '#b45309', grey: '#374151' }
const STORAGE_KEY = 'datocms-debug-panel'
/** A render older than this when the page appears came from a cache. */
const CACHED_AFTER_MS = 5000

const ms = (value: number | null) => (value == null ? '–' : `${Math.round(value)} ms`)
const calls = (count: number) => `${count.toLocaleString('en-US')} ${count === 1 ? 'call' : 'calls'}`
const KB = 1024
const MB = KB * 1024
const GB = MB * 1024
/** Binary units throughout, matching Next.js's 2 MB (2 × 1024 × 1024 bytes) cache limit. */
const size = (bytes: number) =>
  bytes >= GB
    ? `${(bytes / GB).toFixed(1)} GB`
    : bytes >= MB
      ? `${(bytes / MB).toFixed(1)} MB`
      : `${Math.round(bytes / KB)} KB`

type StoredState = { collapsed?: boolean; x?: number; y?: number }

const readStored = (): StoredState => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (value === null || typeof value !== 'object') {
      return {}
    }
    const { collapsed, x, y }: { collapsed?: unknown; x?: unknown; y?: unknown } = value
    return {
      collapsed: typeof collapsed === 'boolean' ? collapsed : undefined,
      x: typeof x === 'number' ? x : undefined,
      y: typeof y === 'number' ? y : undefined
    }
  } catch {
    return {}
  }
}
const writeStored = (value: object) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStored(), ...value }))
  } catch {
    // Storage is optional.
  }
}

/** Remembers the last same-site link click, to time client-side navigations. */
const trackClicks = () => {
  const onClick = (event: MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (link instanceof HTMLAnchorElement && new URL(link.href).origin === window.location.origin) {
      window.__datoDebugClickAt = performance.now()
    }
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

/** An (i) badge that shows a short plain-English explanation on hover or keyboard focus. */
const Info = ({ text }: { text: string }) => {
  // Rendered into document.body, so nothing in the panel can cover or clip it.
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const open = (element: Element) => {
    const rect = element.getBoundingClientRect()
    // Right-aligned to the badge, so it opens over the panel rather than past its edge.
    setAnchor({ left: Math.max(8, Math.min(rect.right - 300, window.innerWidth - 308)), top: rect.bottom + 6 })
  }
  return (
    <span
      style={{ display: 'inline-flex', flexShrink: 0 }}
      onMouseEnter={(event) => open(event.currentTarget)}
      onMouseLeave={() => setAnchor(null)}
    >
      <button
        type="button"
        aria-label="What this measures"
        onFocus={(event) => open(event.currentTarget)}
        onBlur={() => setAnchor(null)}
        style={{ all: 'unset', cursor: 'help', width: 14, height: 14, lineHeight: '14px', textAlign: 'center', borderRadius: 999, fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,.3)', textTransform: 'none' }}
      >
        i
      </button>
      {anchor &&
        createPortal(
        <span
          role="tooltip"
          style={{ position: 'fixed', left: anchor.left, top: anchor.top, zIndex: 2147483647, width: 300, padding: '8px 10px', borderRadius: 8, background: '#030712', border: '1px solid #4b5563', color: '#f9fafb', fontSize: 12, lineHeight: 1.45, fontWeight: 400, letterSpacing: 'normal', textTransform: 'none', whiteSpace: 'normal', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}
        >
          {text}
        </span>,
          document.body
        )}
    </span>
  )
}

/** A tile with a headline value, short detail pills (empty entries skipped) and an info tooltip. */
const Tile = ({ title, value, pills, tone, wide, info }: { title: string; value: string; pills: (string | null | false)[]; tone: string; wide?: boolean; info: string }) => (
  <div style={{ minWidth: 0, background: tone, borderRadius: 8, padding: '8px 10px', gridColumn: wide ? '1 / -1' : undefined }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>
      <span style={{ flex: 1, minWidth: 0, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
      <Info text={info} />
    </div>
    <div style={{ marginTop: 2, fontSize: 22, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={value}>
      {value}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {pills.filter(Boolean).map((pill, index) => (
        <span key={`${index}-${pill}`} title={String(pill)} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11, lineHeight: 1.3, padding: '2px 7px', borderRadius: 999, background: 'rgba(0,0,0,.25)', whiteSpace: 'nowrap' }}>
          {pill}
        </span>
      ))}
    </div>
  </div>
)

/** Estimated size of a Next.js data cache entry: the body is stored base64-encoded, plus headers. */
const cacheEntryBytes = (bytes: number) => Math.ceil(bytes / 3) * 4 + 2048

/** Client view of the DatoCMS debug report for the current page. */
export const DatoDebugPanelView = ({ report }: Props) => {
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [view, setView] = useState<{ ageMs: number; isClientNavigation: boolean; navMs: number | null; ttfb: number | null; domReady: number | null } | null>(null)
  const [edge, setEdge] = useState<{ status: string | null; ageSeconds: number | null; checkedAt: number } | null>(null)
  // Server clock minus browser clock, from the HEAD response's Date + Age headers (1 s resolution).
  const [skewMs, setSkewMs] = useState(0)
  // Ticks every second, so relative times in the panel stay live.
  const [now, setNow] = useState(() => Date.now())
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  // The click and page-shown time read for this report. React StrictMode (dev) runs effects twice
  // and keeps refs, so the second run reads them here after the first cleared the click.
  const shown = useRef<{ builtAt: number; clickAt: number | undefined; pageShownAt: number } | null>(null)
  const positionRef = useRef(position)
  positionRef.current = position

  // Asks Vercel how it caches this URL right now. A HEAD request reads the same
  // cache entry as a visit, so a stale entry also starts the same rebuild.
  useEffect(() => {
    setEdge(null)
    fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
      .then((response) => {
        const age = response.headers.get('age')
        // A cached response keeps its original Date and adds Age, so add Age back.
        const serverNow = Date.parse(response.headers.get('date') ?? '') + (Number(age) || 0) * 1000
        // Ignore skew below the header's 1 s resolution.
        if (!Number.isNaN(serverNow) && Math.abs(serverNow - Date.now()) > 1500) {
          setSkewMs(serverNow - Date.now())
        }
        setEdge({ status: response.headers.get('x-vercel-cache'), ageSeconds: age == null ? null : Number(age), checkedAt: Date.now() })
      })
      .catch(() => setEdge({ status: null, ageSeconds: null, checkedAt: Date.now() }))
  }, [report.builtAt])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const stored = readStored()
    setCollapsed(Boolean(stored.collapsed))
    if (stored.x != null && stored.y != null) {
      setPosition({ x: stored.x, y: stored.y })
    }
    const previous = shown.current?.builtAt === report.builtAt ? shown.current : null
    const pageShownAt = previous ? previous.pageShownAt : (window.__datoDebugPageShownAt ?? performance.now())
    const clickAt = previous ? previous.clickAt : window.__datoDebugClickAt
    shown.current = { builtAt: report.builtAt, clickAt, pageShownAt }
    window.__datoDebugClickAt = undefined
    const [entry] = performance.getEntriesByType('navigation')
    const navigation = entry instanceof PerformanceNavigationTiming ? entry : undefined
    const isClientNavigation = clickAt != null && performance.now() - clickAt < 30_000
    setView({
      ageMs: Date.now() - report.builtAt,
      isClientNavigation,
      // Timed to when the page content appeared, not to this panel's own mount.
      navMs: isClientNavigation ? Math.max(0, pageShownAt - clickAt) : null,
      ttfb: !isClientNavigation && navigation ? navigation.responseStart : null,
      domReady: !isClientNavigation && navigation ? navigation.domContentLoadedEventEnd || null : null
    })
    // The panel can mount before the document finishes loading; read DOM ready once it exists.
    const timer =
      !isClientNavigation && navigation && !navigation.domContentLoadedEventEnd
        ? window.setInterval(() => {
            if (navigation.domContentLoadedEventEnd) {
              window.clearInterval(timer)
              setView((current) => (current ? { ...current, domReady: navigation.domContentLoadedEventEnd } : current))
            }
          }, 250)
        : undefined
    const stopTracking = trackClicks()
    return () => {
      window.clearInterval(timer)
      stopTracking()
    }
  }, [report.builtAt])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!drag.current) {
        return
      }
      setPosition({ x: Math.max(0, event.clientX - drag.current.dx), y: Math.max(0, event.clientY - drag.current.dy) })
    }
    const onUp = () => {
      if (!drag.current) {
        return
      }
      drag.current = null
      if (positionRef.current) {
        writeStored(positionRef.current)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const network = report.calls.filter((call) => call.source === 'network')
  const builtBytes = network.reduce((sum, call) => sum + call.bytes, 0)
  // An old render is either a cached page or, after a click, a copy the browser prefetched.
  // builtAt comes from the server clock; skewMs corrects for a browser clock that differs.
  const arrivalAgeMs = view == null ? null : view.ageMs + skewMs
  const isOldRender = arrivalAgeMs != null && arrivalAgeMs > CACHED_AFTER_MS
  const isPrefetched = isOldRender && view?.isClientNavigation === true && report.isCacheable !== true
  const isFromCache = isOldRender && !isPrefetched
  // A prefetched copy of a per-request page still cost a full build, paid at prefetch time.
  const viewCalls = isFromCache ? 0 : network.length
  const viewBytes = isFromCache ? 0 : builtBytes
  const oversized = network.filter((call) => cacheEntryBytes(call.bytes) > report.cacheLimitBytes)
  const resolved = [...new Set(report.calls.map((call) => call.environmentResolved ?? 'unknown'))]
  const pinned = [...new Set(report.calls.map((call) => call.environmentSent).filter(Boolean))]
  const slowest = network.reduce<DatoDebugCall | null>((max, call) => (!max || call.ms > max.ms ? call : max), null)
  // Cached pages cost nothing per view; pages built per request cost the build every time.
  // A per-request page on a client navigation re-renders only the page segment, not the layout
  // (header, footer). Its numbers then leave out the layout's calls, so don't colour them green.
  const isPartialRender = report.isCacheable === false && view?.isClientNavigation === true
  const isDataCacheOnly = report.isCacheable === false && !isFromCache && network.length === 0
  const isServedFromCacheLater = report.isCacheable === true || (report.isCacheable == null && isFromCache)
  const perThousandCalls = isServedFromCacheLater ? 0 : report.isCacheable === false ? network.length * 1000 : null
  const perThousandBytes = isServedFromCacheLater || report.isCacheable !== false ? 0 : builtBytes * 1000
  // ISR pages cost per time, not per view: at most one rebuild per revalidate window, and only when visited.
  const rebuildsPerDay = report.isCacheable && report.revalidateSeconds != null ? Math.floor(86_400 / report.revalidateSeconds) : null
  // A rebuild refetches every data cache entry that has expired, and they all share the page's
  // timer, so the ceiling counts every call, including those the data cache answered this time.
  const rebuildCalls = report.calls.length
  const rebuildBytes = report.calls.reduce((sum, call) => sum + call.bytes, 0)
  const frame = report.tone ? COLORS[report.tone] : COLORS.grey
  const speedMs = view?.navMs ?? view?.domReady ?? null
  // Thresholds: a click should feel instant (<200 ms); a full load should be ready within 1 s.
  const speedTone =
    speedMs == null
      ? COLORS.grey
      : speedMs < (view?.navMs != null ? 200 : 1000)
        ? COLORS.green
        : speedMs < (view?.navMs != null ? 1000 : 2500)
          ? COLORS.amber
          : COLORS.red
  // view.ageMs is the age when the page appeared; ageSeconds keeps counting.
  const ageSeconds = view == null ? null : Math.max(0, Math.round((now + skewMs - report.builtAt) / 1000))
  const isStale = report.revalidateSeconds != null && ageSeconds != null && ageSeconds >= report.revalidateSeconds
  const wasStaleOnArrival = report.revalidateSeconds != null && arrivalAgeMs != null && arrivalAgeMs >= report.revalidateSeconds * 1000
  const isEdgeCached = edge?.status === 'HIT' || edge?.status === 'STALE' || edge?.status === 'PRERENDER'
  const edgeAgeSeconds = edge?.ageSeconds != null ? edge.ageSeconds + Math.round((now - edge.checkedAt) / 1000) : null
  const oldestDataSeconds = Math.round(Math.max(0, ...report.calls.map((call) => call.dataAgeMs ?? 0)) / 1000)
  const isrValue =
    report.isCacheable === false
      ? 'off: renders on every request'
      : report.revalidateSeconds != null
        ? `stale after ${report.revalidateSeconds} s · built ${ageSeconds ?? '…'} s ago`
        : report.isCacheable
          ? 'static: no timed rebuilds'
          : 'unknown'
  const isrPills = [
    report.revalidateSeconds != null && ageSeconds != null
      ? isStale
        ? `stale ${ageSeconds - report.revalidateSeconds} s`
        : `fresh ${report.revalidateSeconds - ageSeconds} s more`
      : null,
    isStale ? (wasStaleOnArrival ? 'this visit triggered a rebuild' : 'next visit triggers a rebuild') : null,
    report.isRebuild === true ? 'background rebuild' : report.isRebuild === false && report.isCacheable ? 'first build' : null,
    oldestDataSeconds > 0 ? `data cache ≤ ${oldestDataSeconds} s old` : null,
    edge?.status ? `Vercel ${edge.status}${isEdgeCached && edgeAgeSeconds != null ? ` · ${edgeAgeSeconds} s` : ''}` : null
  ]

  const box: CSSProperties = {
    position: 'fixed',
    left: position?.x ?? 16,
    top: position?.y,
    bottom: position ? undefined : 16,
    zIndex: 2147483647,
    width: 420,
    maxHeight: '85vh',
    overflowX: 'hidden',
    overflowY: 'auto',
    background: '#111827',
    color: '#f9fafb',
    font: '13px/1.45 system-ui, -apple-system, sans-serif',
    borderRadius: 12,
    border: `3px solid ${frame}`,
    boxShadow: '0 12px 32px rgba(0,0,0,.5)'
  }

  return (
    <div style={box} data-datocms-debug-panel>
      <div
        style={{ cursor: 'move', padding: '8px 12px', background: frame, display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
        onMouseDown={(event) => {
          // The collapse button sits inside the drag handle; clicking it must not pin the panel.
          if (event.target instanceof Element && event.target.closest('button')) {
            return
          }
          const panel = event.currentTarget.parentElement
          if (!panel) {
            return
          }
          const rect = panel.getBoundingClientRect()
          drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
          if (!position) {
            setPosition({ x: rect.left, y: rect.top })
          }
          event.preventDefault()
        }}
      >
        <div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>DatoCMS debug panel</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{report.label ?? 'DatoCMS calls for this page'}</div>
        </div>
        <button
          type="button"
          style={{ all: 'unset', cursor: 'pointer', padding: '0 6px', fontSize: 16 }}
          onClick={() => {
            setCollapsed(!collapsed)
            writeStored({ collapsed: !collapsed })
          }}
        >
          {collapsed ? '▴' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {view == null
              ? '…'
              : isPrefetched
                ? `The browser prefetched this view ${ageSeconds} s ago, and the server built it then: ${calls(network.length)} to DatoCMS, ${size(builtBytes)}.`
                : isFromCache
                ? `This view came from a cache built ${ageSeconds} s ago: no DatoCMS calls.`
                : report.isCacheable
                  ? `The server built and cached this view: ${calls(network.length)} to DatoCMS, ${size(builtBytes)}. Later views come from the cache.`
                  : report.isCacheable === false
                    ? isPartialRender
                      ? `The server built this view, and builds every view again. This click re-rendered only the page, not the header and footer: ${calls(network.length)} to DatoCMS, ${size(builtBytes)}.`
                      : `The server built this view, and builds every view again: ${calls(network.length)} to DatoCMS, ${size(builtBytes)}.`
                    : `The server built this view: ${calls(network.length)} to DatoCMS, ${size(builtBytes)}.`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            <Tile
              info={`Counts the requests the server sent to DatoCMS to produce this page, and their size; on a full page load that includes the header and footer. These are what DatoCMS bills and what slows a page down. ${viewCalls === 0 ? 'This view cost nothing: it came from a cache.' : `This view cost ${calls(viewCalls)} and ${size(viewBytes)}.`} Ideally most views show 0, because a cached page is served, and rebuilds stay small.`}
              title="Calls this view"
              value={`${viewCalls} · ${size(viewBytes)}`}
              pills={[
                isFromCache ? 'from page cache' : isPrefetched ? 'built at prefetch' : 'built for this view',
                isFromCache ? `build: ${calls(network.length)} · ${size(builtBytes)}` : null,
                `${report.calls.length - network.length} from data cache`,
                isDataCacheOnly ? 'data cache expires after 60 s' : null,
                isPartialRender ? 'header and footer not re-rendered' : null
              ]}
              tone={viewBytes > 5e6 ? COLORS.red : viewCalls > 0 ? COLORS.amber : isDataCacheOnly || isPartialRender ? COLORS.grey : COLORS.green}
            />
            <Tile
              info={`Shows which DatoCMS environment (a copy of the content and schema) answered. Without an X-Environment header, DatoCMS uses the primary environment. ${pinned.length ? `This deployment asks for "${pinned.join(', ')}" by name, so it ignores which environment is primary.` : 'This deployment follows the primary, as production should.'} Production should never name an environment; previews can, on purpose.`}
              title="Environment"
              value={resolved.join(', ') || '–'}
              pills={[pinned.length ? `pinned: ${pinned.join(', ')}` : 'primary', pinned.length ? 'X-Environment sent' : 'no X-Environment']}
              tone={pinned.length ? COLORS.amber : COLORS.green}
            />
            <Tile
              info={`Next.js won't cache a response whose stored copy exceeds 2 MB. It stores the body base64-encoded, so responses over about 1.5 MB already miss, and reach DatoCMS on every render. ${oversized.length ? `${calls(oversized.length)} here exceeded it, so ${oversized.length === 1 ? 'it repeats' : 'they repeat'} on every render.` : 'Every response here fits.'} Keep queries well under 1.5 MB by asking only for fields the page uses.`}
              title="Too big to cache"
              value={String(oversized.length)}
              pills={
                oversized.length
                  ? oversized.map((call) => `${call.operation} · ${size(call.bytes)}`)
                  : [isPartialRender ? 'header and footer not checked' : 'all fit the data cache']
              }
              tone={oversized.length ? COLORS.red : isPartialRender ? COLORS.grey : COLORS.green}
            />
            <Tile
              info={`Shows how fast this page appeared. ${view?.navMs != null ? 'For a click inside the site, it times the click to the new page appearing.' : 'For a full page load, it shows when the first byte arrived and when the page was ready.'} Pages served from a cache appear in tens of milliseconds; pages built on every view wait for the server and DatoCMS. The slowest DatoCMS call shows which query the server waited on longest.`}
              title="Performance"
              value={view?.navMs != null ? `${ms(view.navMs)} to page` : `${ms(view?.domReady ?? null)} ready`}
              pills={[
                view?.navMs != null ? 'click → page shown' : `first byte ${ms(view?.ttfb ?? null)}`,
                slowest ? `slowest call ${ms(slowest.ms)}` : null,
                slowest ? slowest.operation : null
              ]}
              tone={speedTone}
            />
            <Tile
              wide
              info={
                rebuildsPerDay != null
                  ? `Estimates how much this page can cost in DatoCMS traffic. A cached page is rebuilt at most once per ${report.revalidateSeconds} s, and only when someone visits, so the cost has a ceiling no matter how many views it gets. Lower is better: smaller queries shrink each rebuild.`
                  : `Estimates DatoCMS traffic for 1,000 views of a page like this. This page renders on every view, so its cost grows with traffic. Ideally pages are cached, so views cost nothing and only occasional rebuilds hit DatoCMS.`
              }
              title={rebuildsPerDay != null ? 'Projected traffic, this page' : 'Projected traffic per 1,000 views'}
              value={
                rebuildsPerDay != null
                  ? `≤ ${calls(rebuildCalls)} · ${size(rebuildBytes)} / ${report.revalidateSeconds} s`
                  : perThousandCalls == null
                    ? 'unknown'
                    : `${calls(perThousandCalls)} · ${size(perThousandBytes)}`
              }
              pills={
                rebuildsPerDay != null
                  ? [`≤ ${calls(rebuildCalls * rebuildsPerDay)} · ${size(rebuildBytes * rebuildsPerDay)} / day`, 'any number of views', 'only if visited']
                  : perThousandCalls == null
                    ? ['unknown if cached']
                    : isServedFromCacheLater
                      ? ['views cost nothing', `rebuild: ${calls(network.length)} · ${size(builtBytes)}`]
                      : [
                          'renders every view',
                          network.length ? null : 'data cache answered all',
                          isPartialRender ? 'full page loads add header and footer calls' : null
                        ]
              }
              tone={
                perThousandBytes > 1e9 ? COLORS.red : (perThousandCalls ?? 0) > 0 ? COLORS.amber : isDataCacheOnly || isPartialRender ? COLORS.grey : COLORS.green
              }
            />
            <Tile
              wide
              info={
                report.isCacheable === false
                  ? 'Shows whether the server reuses a built copy of this page. It does not: every view renders the page from scratch, which costs time and DatoCMS calls. Ideally the page is cached and refreshed on a timer (incremental static regeneration).'
                  : `Shows the server's cached copy of this page. After ${report.revalidateSeconds ?? '?'} s the copy goes stale; the next visitor still gets it instantly, and the server rebuilds it in the background for later visitors. ${isStale ? 'This copy is stale, so a rebuild is due.' : 'This copy is fresh.'} The timer trades content freshness against rebuild cost.`
              }
              title="Page cache (ISR)"
              value={isrValue}
              pills={isrPills}
              tone={report.isCacheable === false ? COLORS.red : isStale ? COLORS.amber : report.isCacheable ? COLORS.green : COLORS.grey}
            />
          </div>
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', color: '#d1d5db', fontWeight: 600 }}>All DatoCMS calls ({report.calls.length})</summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#9ca3af', textAlign: 'left' }}>
                  <th>Operation</th><th>Source</th><th style={{ textAlign: 'right' }}>Time</th><th style={{ textAlign: 'right' }}>Size</th><th>Env</th>
                </tr>
              </thead>
              <tbody>
                {report.calls.map((call, index) => (
                  <tr key={`${call.operation}-${index}`} style={{ borderTop: '1px solid #374151', color: call.errors.length ? '#fca5a5' : undefined }}>
                    <td>{call.operation}</td>
                    <td>{call.source === 'network' ? `DatoCMS${call.cdnCache ? ` (CDN ${call.cdnCache})` : ''}` : `Next.js cache${call.dataAgeMs != null ? ` (${Math.round(call.dataAgeMs / 1000)} s old)` : ''}`}</td>
                    <td style={{ textAlign: 'right' }}>{ms(call.ms)}</td>
                    <td style={{ textAlign: 'right' }}>{size(call.bytes)}</td>
                    <td>{call.environmentResolved ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <div style={{ marginTop: 8, color: '#9ca3af', fontSize: 11 }}>
            Shown because DATOCMS_DEBUG_PANEL=true. Remove the variable to hide this panel.
          </div>
        </div>
      )}
    </div>
  )
}
