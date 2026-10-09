import { notFound } from 'next/navigation'
import { cache } from 'react'
import { TemplateBlogListingPage } from '../../../../../components/template-blog-listing-page'
import { initDatoSdk } from '../../../../../core/dato/sdk'
import { logger } from '../../../../../core/logger/logger'
import { rethrowPageError } from '../../../../../core/errors/rethrow-page-error'
import { withDatoDebugPanel } from '../../../../../components/datocms-debug-panel'

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

const getAllCategoriesData = cache(async () => {
  const sdk = initDatoSdk()
  return await sdk.getAllCategories()
})

const getPostsByCategoryData = cache(async (categoryId: string) => {
  const sdk = initDatoSdk()
  return await sdk.getPostsByCategory({ categoryId })
})

const BlogCategoryPage = async ({ params }: Props) => {
  try {
    const { handle } = await params

    const categoriesResponse = await getAllCategoriesData()
    const category = categoriesResponse.allCategories.find(
      (cat) => cat.model?.handle === handle
    )

    if (!category) {
      logger.warn({ handle }, 'Category not found')
      notFound()
    }

    const response = await getPostsByCategoryData(category.id)

    logger.debug(
      {
        response,
        categoryHandle: handle,
        categoryId: category.id
      },
      'Blog category response:'
    )

    return (
      <TemplateBlogListingPage
        data={response}
        categories={categoriesResponse}
        selectedCategory={category ?? null}
        currentPage={1}
      />
    )
  } catch (err) {
    rethrowPageError(err, 'Blog category request failed')
  }
}

export default withDatoDebugPanel(BlogCategoryPage)
