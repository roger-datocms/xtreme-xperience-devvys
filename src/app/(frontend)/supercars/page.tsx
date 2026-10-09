import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { generateSeoMetadata } from '../../../components/global-seo'
import { TemplateSupercarListingPage } from '../../../components/template-supercar-listing-page'
import { initDatoSdk } from '../../../core/dato/sdk'
import { logger } from '../../../core/logger/logger'
import { rethrowPageError } from '../../../core/errors/rethrow-page-error'
import { withDatoDebugPanel } from '../../../components/datocms-debug-panel'

// Revalidate page data every 60 seconds for faster server responses
export const revalidate = 60

const getPageData = cache(async () => {
  const sdk = initDatoSdk()
  return await sdk.getPage({ handle: 'supercars' })
})

export const generateMetadata = async (): Promise<Metadata> => {
  try {
    const response = await getPageData()

    if (!response?.allPages?.length) {
      return generateSeoMetadata()
    }

    const pageSeo = response.allPages[0]?.config?.seo ?? null
    return generateSeoMetadata(pageSeo)
  } catch (error) {
    logger.error(
      { error },
      'Failed to generate metadata for supercars listing page'
    )
    return generateSeoMetadata()
  }
}

const SupercarsListingPage = async () => {
  try {
    const response = await getPageData()

    if (!response?.allPages?.length) {
      logger.warn('No page found for supercars listing')
      notFound()
    }

    logger.debug(
      {
        response
      },
      'Supercars listing response:'
    )

    return <TemplateSupercarListingPage data={response} />
  } catch (err) {
    rethrowPageError(err, 'Supercars listing request failed')
  }
}

export default withDatoDebugPanel(SupercarsListingPage)
