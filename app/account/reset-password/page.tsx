import { Suspense } from 'react'
import { StoreFooter } from '@/components/store-footer'
import ResetPasswordForm from './form'

export default function ResetPasswordPage() {
  return <><Suspense fallback={<main className="section" />}><ResetPasswordForm /></Suspense><StoreFooter /></>
}
