import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { Footer } from '@/components/footer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params
  const page = await db.page.findUnique({
    where: { handle },
    select: { title: true, seoTitle: true, seoDescription: true, status: true },
  })
  if (!page || page.status !== 'PUBLISHED') return {}
  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription || undefined,
  }
}

export default async function CustomPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const { theme } = await getThemeState()
  const page = await db.page.findUnique({ where: { handle } })
  if (!page || page.status !== 'PUBLISHED') notFound()

  return <>
    <div className="focalStorefront">
      <div className="aliContainer aliLegalPage">
        <h1>{page.title}</h1>
        {page.bodyHtml && <div dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />}
      </div>
    </div>
    <Footer theme={theme} />
  </>
}
