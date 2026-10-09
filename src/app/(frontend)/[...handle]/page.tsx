import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { generateSeoMetadata } from '../../../components/global-seo'
import { TemplatePage } from '../../../components/template-page'
import { initDatoSdk } from '../../../core/dato/sdk'
import { logger } from '../../../core/logger/logger'
import { rethrowPageError } from '../../../core/errors/rethrow-page-error'
import { withDatoDebugPanel } from '../../../components/datocms-debug-panel'

// No pages are prebuilt: each one renders on its first request, then the
// cache serves it and regenerates it at most every 60 s (time-based ISR).
export const generateStaticParams = async () => []

// Revalidate page data every 60 seconds for faster server responses
export const revalidate = 60

type RouteParams = {
  handle: string[]
}

type Props = {
  params: Promise<RouteParams>
}

const getPageData = cache(async (params: RouteParams) => {
  const sdk = initDatoSdk()
  const slug = params.handle?.[0]

  if (!slug) {
    logger.warn({ params }, 'Missing slug in catch-all route params')
    return null
  }

  // Pages have single-segment handles. Without this, /about/x/y would serve
  // /about and get its own cache entry for every extra path.
  if (params.handle.length > 1) {
    return null
  }

  const response = await sdk.getPage({ handle: slug })

  if (!response?.allPages?.length) {
    return null
  }

  return response
})

export const generateMetadata = async ({
  params
}: Props): Promise<Metadata> => {
  const awaitedParams = await params
  try {
    const response = await getPageData(awaitedParams)

    if (!response) {
      return generateSeoMetadata()
    }

    const pageSeo = response.allPages[0]?.config?.seo ?? null
    return generateSeoMetadata(pageSeo)
  } catch (error) {
    logger.error(
      { error, params: awaitedParams },
      'Failed to generate metadata for page'
    )
    return generateSeoMetadata()
  }
}

const CatchAllPage = async ({ params }: Props) => {
  const awaitedParams = await params
  try {
    const response = await getPageData(awaitedParams)

    if (!response) {
      notFound()
    }

    logger.debug({ response }, 'Page response')
    return <TemplatePage data={response} />
  } catch (error) {
    rethrowPageError(error, 'Page request failed', { params: awaitedParams })
  }
}

export default withDatoDebugPanel(CatchAllPage)
