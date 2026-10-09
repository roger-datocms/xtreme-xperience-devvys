import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { generateSeoMetadata } from '../../../../components/global-seo'
import { TemplateLandingPage } from '../../../../components/template-landing-page'
import { initDatoSdk } from '../../../../core/dato/sdk'
import { logger } from '../../../../core/logger/logger'
import { rethrowPageError } from '../../../../core/errors/rethrow-page-error'
import { withDatoDebugPanel } from '../../../../components/datocms-debug-panel'

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

const getLandingPageData = cache(async (params: RouteParams) => {
  const sdk = initDatoSdk()
  const slug = params.handle?.[0]

  if (!slug) {
    logger.warn({ params }, 'Missing slug in landing-page route params')
    return null
  }

  // Landing pages have single-segment handles. Without this, /lp/foo/x/y would
  // serve /lp/foo and get its own cache entry for every extra path.
  if (params.handle.length > 1) {
    return null
  }

  const response = await sdk.getLandingPage({ handle: slug })

  if (!response?.allLandingPages?.length) {
    return null
  }

  return response
})

export const generateMetadata = async ({
  params
}: Props): Promise<Metadata> => {
  const awaitedParams = await params
  try {
    const response = await getLandingPageData(awaitedParams)

    if (!response) {
      return generateSeoMetadata()
    }

    const landingPageSeo = response.allLandingPages[0]?.config?.seo ?? null
    return generateSeoMetadata(landingPageSeo)
  } catch (error) {
    logger.error(
      { error, params: awaitedParams },
      'Failed to generate metadata for landing page'
    )
    return generateSeoMetadata()
  }
}

const LandingPage = async ({ params }: Props) => {
  const awaitedParams = await params
  try {
    const response = await getLandingPageData(awaitedParams)

    if (!response) {
      notFound()
    }

    logger.debug({ response }, 'Landing page response')
    return <TemplateLandingPage data={response} />
  } catch (error) {
    rethrowPageError(error, 'Landing page request failed', { params: awaitedParams })
  }
}

export default withDatoDebugPanel(LandingPage)
