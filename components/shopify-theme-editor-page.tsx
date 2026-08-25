import ShopifyThemeEditorV3 from '@/components/shopify-theme-editor-v3'
import ThemeInspectorStyles from '@/components/theme-inspector-styles'

type Props = { initial: { theme: Record<string, any>; sections: any[]; navigation: any[] } }

export default function ShopifyThemeEditorPage({ initial }: Props) {
  return <><ThemeInspectorStyles /><ShopifyThemeEditorV3 initial={initial} /></>
}
