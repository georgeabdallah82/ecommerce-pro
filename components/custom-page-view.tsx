import StorefrontSections from '@/components/storefront-sections'
import { showPageHeader } from '@/lib/custom-pages'

type AnyMap = Record<string, any>

// One renderer for a custom page, shared by the live /[handle] route and the theme
// editor's preview so what you design is what visitors get.
export default function CustomPageView({ theme, page, sections, products, collections }: { theme: AnyMap; page: { title: string; bodyHtml?: string | null }; sections: AnyMap[]; products: AnyMap[]; collections: AnyMap[] }) {
  return (
    <div className="focalStorefront">
      {showPageHeader(page, sections.length) && (
        <div className="aliContainer aliLegalPage">
          <h1>{page.title}</h1>
          {page.bodyHtml && <div dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />}
        </div>
      )}
      {sections.length > 0 && <StorefrontSections theme={theme} sections={sections} products={products} collections={collections} />}
    </div>
  )
}
