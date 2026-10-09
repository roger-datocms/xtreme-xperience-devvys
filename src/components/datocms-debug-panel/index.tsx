/**
 * DatoCMS debug panel: an optional on-page box that lists the DatoCMS calls behind each page.
 *
 * - Turn it on with DATOCMS_DEBUG_PANEL=true. Any other value, or none, turns it off.
 * - Optional: DATOCMS_DEBUG_PANEL_LABEL sets the heading. DATOCMS_DEBUG_PANEL_TONE (red or green) sets the frame.
 * - Pages show the panel through `withDatoDebugPanel()`. The browser view lives in panel-view.tsx.
 * - The SDK records calls through `getDatoDebugSession()` in src/core/dato/debug.ts.
 *
 * The panel reads no request data, so pages stay cacheable. On a cached page, it shows what the
 * page cost when the server built it. If recording or rendering fails, the page renders without it.
 */
import { type ReactNode, Suspense } from 'react'
import {
  getDatoDebugCollector,
  isDatoDebugEnabled,
  NEXT_DATA_CACHE_LIMIT_BYTES,
  waitForDatoCalls
} from '../../core/dato/debug'
import { type DatoDebugReport, DatoDebugPageShownMark, DatoDebugPanelView } from './panel-view'

/** Next's internal "never revalidate" value. */
const INFINITE_REVALIDATE = 0xfffffffe

/**
 * How Next is rendering this page: for its cache (static or ISR) or per request, the page's
 * effective revalidate time, and whether this render is a background rebuild of a stale page.
 * Reads Next's internal work stores, so each field is null if those ever change.
 */
const getRenderInfo = async (): Promise<Pick<DatoDebugReport, 'isCacheable' | 'revalidateSeconds' | 'isRebuild'>> => {
  try {
    const [{ workAsyncStorage }, { workUnitAsyncStorage }] = await Promise.all([
      import('next/dist/server/app-render/work-async-storage.external'),
      import('next/dist/server/app-render/work-unit-async-storage.external')
    ])
    const work = workAsyncStorage.getStore()
    const unit = workUnitAsyncStorage.getStore()
    // Next lowers the page's revalidate to the shortest fetch revalidate as fetches run.
    const revalidate = unit && 'revalidate' in unit && typeof unit.revalidate === 'number' ? unit.revalidate : null
    return {
      isCacheable: work?.isStaticGeneration ?? null,
      revalidateSeconds: revalidate === INFINITE_REVALIDATE || revalidate === 0 ? null : revalidate,
      isRebuild: work?.isRevalidate ?? null
    }
  } catch {
    return { isCacheable: null, revalidateSeconds: null, isRebuild: null }
  }
}

const DatoDebugPanelData = async () => {
  try {
    const collector = getDatoDebugCollector()
    await waitForDatoCalls(collector)
    // Read after the calls finish: each fetch can lower the page's revalidate time.
    const renderInfo = await getRenderInfo()
    const tone = process.env.DATOCMS_DEBUG_PANEL_TONE
    const report: DatoDebugReport = {
      builtAt: Date.now(),
      ...renderInfo,
      label: process.env.DATOCMS_DEBUG_PANEL_LABEL || null,
      tone: tone === 'red' || tone === 'green' ? tone : null,
      cacheLimitBytes: NEXT_DATA_CACHE_LIMIT_BYTES,
      calls: collector.calls
    }
    return <DatoDebugPanelView report={report} />
  } catch {
    return null
  }
}

/**
 * Wraps a page so the debug panel renders next to its content, inside the page segment.
 * On a full render, the panel counts the layout's calls too (header, footer, global config).
 * Client-side navigations to pages rendered per request refetch only the page segment, so the
 * panel then counts the page's own calls. Cached pages show what the full render that built them cost.
 * With the panel off, only the page renders.
 */
export const withDatoDebugPanel = <Props,>(Page: (props: Props) => Promise<ReactNode>) => {
  const PageWithDatoDebugPanel = async (props: Props) => {
    const content = await Page(props)
    if (!isDatoDebugEnabled()) {
      return content
    }
    return (
      <>
        {content}
        <DatoDebugPageShownMark />
        <Suspense fallback={null}>
          <DatoDebugPanelData />
        </Suspense>
      </>
    )
  }
  return PageWithDatoDebugPanel
}
