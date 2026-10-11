import { redirect } from 'next/navigation'

// Data management moved into Products (Import / Export) and Collections (Import / Export).
export default function DataTransfer() {
  redirect('/admin/products/import')
}
