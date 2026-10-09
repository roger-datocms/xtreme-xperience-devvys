import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { generateSeoMetadata } from '../../../../components/global-seo'
import { TemplateTrackDetailPage } from '../../../../components/template-track-detail-page'
import { initDatoSdk } from '../../../../core/dato/sdk'
import { logger } from '../../../../core/logger/logger'
import { rethrowPageError } from '../../../../core/errors/rethrow-page-error'
import { withDatoDebugPanel } from '../../../../components/datocms-debug-panel'

// No pages are prebuilt: each one renders on its first request, then the
// cache serves it and regenerates it at most every 60 s (time-based ISR).
export const generateStaticParams = async () => []

// Revalidate page data every 60 seconds for faster server responses
export const revalidate = 60

type Props = {
  params: Promise<{
    handle: string
  }>
}

const getTrackData = cache(async (handle: string) => {
  const sdk = initDatoSdk()
  return await sdk.getTrack({ handle })
})

export const generateMetadata = async ({
  params
}: Props): Promise<Metadata> => {
  const { handle } = await params
  try {
    const response = await getTrackData(handle)

    if (!response?.track) {
      return generateSeoMetadata()
    }

    const trackSeo = response.track.config?.seo ?? null
    return generateSeoMetadata(trackSeo)
  } catch (error) {
    logger.error(
      { error, handle },
      'Failed to generate metadata for track detail page'
    )
    return generateSeoMetadata()
  }
}

const TrackDetailPage = async ({ params }: Props) => {
  try {
    const { handle } = await params
    const response = await getTrackData(handle)

    if (!response) {
      notFound()
    }

    logger.debug(
      {
        response
      },
      'Track detail response:'
    )

    return <TemplateTrackDetailPage data={response} />
  } catch (err) {
    rethrowPageError(err, 'Track detail request failed')
  }
}

export default withDatoDebugPanel(TrackDetailPage)
