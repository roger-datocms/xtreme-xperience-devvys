import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { generateSeoMetadata } from '../../../../components/global-seo'
import { TemplateSupercarDetailPage } from '../../../../components/template-supercar-detail-page'
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

const getSupercarData = cache(async (handle: string) => {
  const sdk = initDatoSdk()
  return await sdk.getSupercar({ handle })
})

export const generateMetadata = async ({
  params
}: Props): Promise<Metadata> => {
  const { handle } = await params
  try {
    const response = await getSupercarData(handle)

    if (!response?.supercar) {
      return generateSeoMetadata()
    }

    const supercarSeo = response.supercar.config?.seo ?? null
    return generateSeoMetadata(supercarSeo)
  } catch (error) {
    logger.error(
      { error, handle },
      'Failed to generate metadata for supercar detail page'
    )
    return generateSeoMetadata()
  }
}

const SupercarDetailPage = async ({ params }: Props) => {
  try {
    const { handle } = await params
    const response = await getSupercarData(handle)

    if (!response) {
      notFound()
    }

    logger.debug(
      {
        response
      },
      'Supercar detail response:'
    )

    return <TemplateSupercarDetailPage data={response} />
  } catch (err) {
    rethrowPageError(err, 'Supercar detail request failed')
  }
}

export default withDatoDebugPanel(SupercarDetailPage)
