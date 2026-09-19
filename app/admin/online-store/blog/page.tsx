import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import BlogPostsAdmin from '@/components/blog-posts-admin'

export default async function Blog() {
  await requirePermission('content.view')
  const rows = await db.blogPost.findMany({ orderBy: { updatedAt: 'desc' } })
  return <BlogPostsAdmin initial={JSON.parse(JSON.stringify(rows))} />
}
