'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import styles from './admin-toast.module.css'

type ToastType = 'success' | 'error'
type Toast = { id: number; message: string; type: ToastType }

const ToastContext = createContext<((message: string, type?: ToastType) => void) | null>(null)

export function useToast() {
  const fn = useContext(ToastContext)
  if (!fn) throw new Error('useToast must be used within ToastProvider')
  return fn
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId.current++
    setToasts(current => [...current, { id, message, type }])
    setTimeout(() => dismiss(id), type === 'error' ? 6000 : 4000)
  }, [dismiss])

  return <ToastContext.Provider value={toast}>
    {children}
    <div className={styles.host}>
      {toasts.map(t => (
        <div key={t.id} className={t.type === 'error' ? `${styles.toast} ${styles.toastError}` : styles.toast}>
          {t.type === 'error' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{t.message}</span>
          <button className={styles.dismiss} onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  </ToastContext.Provider>
}
