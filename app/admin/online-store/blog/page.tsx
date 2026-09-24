import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { parseJson } from '@/lib/utils'
import BlogPostsAdmin from '@/components/blog-posts-admin'

export default async function Blog() {
  await requirePermission('content.view')
  const rows = await db.blogPost.findMany({ orderBy: { updatedAt: 'desc' } })
  const withTags = rows.map((r) => ({ ...r, tags: parseJson<unknown>(r.tagsJson, []) }))
  return <BlogPostsAdmin initial={JSON.parse(JSON.stringify(withTags))} />
}
