import { notFound } from 'next/navigation'
import { cache } from 'react'
import { TemplateBlogListingPage } from '../../../../../../../components/template-blog-listing-page'
import {
  POSTS_PER_PAGE,
  POSTS_PER_PAGE_FIRST
} from '../../../../../../../config/settings'
import { initDatoSdk } from '../../../../../../../core/dato/sdk'
import { logger } from '../../../../../../../core/logger/logger'
import { rethrowPageError } from '../../../../../../../core/errors/rethrow-page-error'
import { withDatoDebugPanel } from '../../../../../../../components/datocms-debug-panel'

// No pages are prebuilt: each one renders on its first request, then the
// cache serves it and regenerates it at most every 60 s (time-based ISR).
export const generateStaticParams = async () => []

// Revalidate page data every 60 seconds for faster server responses
export const revalidate = 60

type Props = {
  params: Promise<{
    handle: string
    number: string
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

const BlogCategoryPagePaginated = async ({ params }: Props) => {
  try {
    const { handle, number } = await params
    const pageNumber = Number.parseInt(number, 10)

    // Validate page number
    if (Number.isNaN(pageNumber) || pageNumber < 1) {
      notFound()
    }

    const categoriesResponse = await getAllCategoriesData()
    const category = categoriesResponse.allCategories.find(
      (cat) => cat.model?.handle === handle
    )

    if (!category) {
      logger.warn({ handle }, 'Category not found')
      notFound()
    }

    const response = await getPostsByCategoryData(category.id)

    // Calculate total pages to validate
    const allPostsExcludingFeatured = response.allPosts.filter(
      (post) =>
        post?.id !== response.allPosts.find((p) => p?.model?.featured)?.id
    )
    const remainingAfterFirst =
      allPostsExcludingFeatured.length - POSTS_PER_PAGE_FIRST
    const totalPages =
      remainingAfterFirst <= 0
        ? 1
        : 1 + Math.ceil(remainingAfterFirst / POSTS_PER_PAGE)

    // If page number exceeds total pages, show 404
    if (pageNumber > totalPages) {
      notFound()
    }

    logger.debug(
      {
        response,
        categoryHandle: handle,
        categoryId: category.id,
        pageNumber
      },
      'Blog category response:'
    )

    return (
      <TemplateBlogListingPage
        data={response}
        categories={categoriesResponse}
        selectedCategory={category ?? null}
        currentPage={pageNumber}
      />
    )
  } catch (err) {
    rethrowPageError(err, 'Blog category request failed')
  }
}

export default withDatoDebugPanel(BlogCategoryPagePaginated)
