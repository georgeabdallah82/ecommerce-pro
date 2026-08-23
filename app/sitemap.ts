import type { MetadataRoute } from 'next'
import { db } from '@/lib/prisma'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const [products, pages, posts] = await Promise.all([
    db.product.findMany({ where: { status: 'ACTIVE' }, select: { slug: true, updatedAt: true } }),
    db.page.findMany({ where: { status: 'PUBLISHED' }, select: { handle: true, updatedAt: true } }),
    db.blogPost.findMany({ where: { status: 'PUBLISHED' }, select: { handle: true, updatedAt: true } }),
  ])

  return [
    { url: base, lastModified: new Date() },
    { url: `${base}/products`, lastModified: new Date() },
    ...products.map(p => ({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt })),
    ...pages.map(p => ({ url: `${base}/${p.handle}`, lastModified: p.updatedAt })),
    ...posts.map(p => ({ url: `${base}/blog/${p.handle}`, lastModified: p.updatedAt })),
  ]
}
