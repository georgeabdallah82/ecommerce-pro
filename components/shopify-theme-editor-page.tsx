import FocalThemeEditor from '@/components/focal-theme-editor'

type Props = { initial: { theme: Record<string, any>; sections: any[]; navigation: any[]; draft: boolean } }

export default function ShopifyThemeEditorPage({ initial }: Props) {
  return <FocalThemeEditor initial={initial} />
}
