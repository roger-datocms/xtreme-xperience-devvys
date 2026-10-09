import { cache } from 'react'
import { TemplateBlogListingPage } from '../../../components/template-blog-listing-page'
import { initDatoSdk } from '../../../core/dato/sdk'
import { logger } from '../../../core/logger/logger'
import { rethrowPageError } from '../../../core/errors/rethrow-page-error'
import { withDatoDebugPanel } from '../../../components/datocms-debug-panel'

// Revalidate page data every 60 seconds for faster server responses
export const revalidate = 60

const getBlogPostsData = cache(async (categoryId?: string) => {
  const sdk = initDatoSdk()
  if (categoryId && categoryId !== 'all-posts') {
    return await sdk.getPostsByCategory({ categoryId })
  }
  return await sdk.getPosts()
})

const getCategoriesData = cache(async () => {
  const sdk = initDatoSdk()
  return await sdk.getAllCategories()
})

const BlogListingPage = async () => {
  try {
    const response = await getBlogPostsData()
    const categories = await getCategoriesData()
    logger.debug(
      {
        response,
        categories: categories
      },
      'Blog listing response:'
    )

    return (
      <TemplateBlogListingPage
        data={response}
        categories={categories}
        selectedCategory={null}
        currentPage={1}
      />
    )
  } catch (err) {
    rethrowPageError(err, 'Blog listing request failed')
  }
}

export default withDatoDebugPanel(BlogListingPage)
