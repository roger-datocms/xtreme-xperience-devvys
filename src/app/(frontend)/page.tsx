import type { Metadata } from 'next'
import { cache } from 'react'
import { generateSeoMetadata } from '../../components/global-seo'
import { TemplateHomepage } from '../../components/template-homepage'
import { initDatoSdk } from '../../core/dato/sdk'
import { logger } from '../../core/logger/logger'
import { rethrowPageError } from '../../core/errors/rethrow-page-error'
import { withDatoDebugPanel } from '../../components/datocms-debug-panel'

// Revalidate homepage data every 60 seconds for faster server responses
// This enables ISR (Incremental Static Regeneration) to serve cached HTML
export const revalidate = 60

const getHomepageData = cache(async () => {
  const sdk = initDatoSdk()
  return await sdk.getHomepage()
})

export const generateMetadata = async (): Promise<Metadata> => {
  try {
    const response = await getHomepageData()
    const homepageSeo = response.homepage?.config?.seo ?? null
    return generateSeoMetadata(homepageSeo)
  } catch (err) {
    logger.error({ error: err }, 'Failed to generate metadata for homepage')
    return generateSeoMetadata()
  }
}

const FrontendHomePage = async () => {
  try {
    const response = await getHomepageData()

    logger.debug({ response }, 'Homepage response:')

    return <TemplateHomepage data={response} />
  } catch (err) {
    rethrowPageError(err, 'Homepage request failed')
  }
}

export default withDatoDebugPanel(FrontendHomePage)
