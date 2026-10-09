import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { generateSeoMetadata } from '../../../../components/global-seo'
import { TemplateBlogDetailPage } from '../../../../components/template-blog-detail-page'
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

const getBlogPostData = cache(async (handle: string) => {
  const sdk = initDatoSdk()
  return await sdk.getPost({ handle })
})

export const generateMetadata = async ({
  params
}: Props): Promise<Metadata> => {
  const { handle } = await params
  try {
    const response = await getBlogPostData(handle)

    if (!response?.post) {
      return generateSeoMetadata()
    }

    const postSeo = response.post.config?.seo ?? null
    return generateSeoMetadata(postSeo)
  } catch (error) {
    logger.error(
      { error, handle },
      'Failed to generate metadata for blog detail page'
    )
    return generateSeoMetadata()
  }
}

const BlogDetailPage = async ({ params }: Props) => {
  try {
    const { handle } = await params
    const response = await getBlogPostData(handle)

    if (!response) {
      notFound()
    }

    logger.debug(
      {
        response
      },
      'Blog detail response:'
    )

    return <TemplateBlogDetailPage data={response} />
  } catch (err) {
    rethrowPageError(err, 'Blog detail request failed')
  }
}

export default withDatoDebugPanel(BlogDetailPage)
