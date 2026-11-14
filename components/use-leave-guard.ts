'use client'

import { useEffect } from 'react'
import { useConfirm } from './admin-confirm'

// Leaving an admin editor that has unsaved changes (docs/admin-leave-warning-2026-11.md). The editors only warned
// when the tab was reloaded or closed: a link in the sidebar, a search result or the browser's Back left at once,
// and the changes were gone.
// - Admin links (components/admin-link.tsx) ask first, in the admin's own dialog.
// - Back and Forward ask first where the browser lets a page hold them (the Navigation API: Chrome, Edge, Samsung
//   Internet and others); elsewhere they leave as before.
// - Reloading, closing the tab and plain links keep the browser's own warning.
// An editor calls allowLeave() just before it leaves on purpose: after a save that opens the new page, a discard
// that reloads, a delete.

type Guard = { ask: () => Promise<boolean> }
type NavigateEventLike = Event & { navigationType?: string; destination?: { index: number; sameDocument: boolean } }
type NavigationLike = EventTarget & { currentEntry?: { index: number } | null }

const guards = new Set<Guard>()
// Set once the person has chosen to leave (or the editor leaves on purpose), so nothing asks a second time.
let leaving = false

export function hasUnsavedChanges() {
  return guards.size > 0 && !leaving
}

export function allowLeave() {
  leaving = true
}

// True when there is nothing unsaved, or when the person chose to leave.
export async function confirmLeave(): Promise<boolean> {
  const guard = guards.values().next().value
  if (!guard || leaving) return true
  const ok = await guard.ask()
  if (ok) leaving = true
  return ok
}

export function useLeaveGuard(dirty: boolean) {
  const confirm = useConfirm()
  useEffect(() => {
    if (!dirty) return
    leaving = false
    const guard: Guard = {
      ask: () => confirm({
        title: 'Leave without saving?',
        message: "Your changes on this page aren't saved yet. If you leave now, they're lost.",
        confirmLabel: 'Leave without saving',
        cancelLabel: 'Stay on this page',
      }),
    }
    guards.add(guard)
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    // Back and Forward between admin pages don't unload the page, so the browser doesn't warn. Where the browser lets
    // the page hold the step, hold it, ask, and take it if the person chooses to leave.
    const navigation = (window as unknown as { navigation?: NavigationLike }).navigation
    const onNavigate = (event: Event) => {
      const step = event as NavigateEventLike
      if (leaving || step.navigationType !== 'traverse' || !step.cancelable || !step.destination?.sameDocument) return
      const delta = step.destination.index - (navigation?.currentEntry?.index ?? step.destination.index)
      if (!delta) return
      event.preventDefault()
      void confirmLeave().then(ok => { if (ok) window.history.go(delta) })
    }
    navigation?.addEventListener('navigate', onNavigate)
    return () => {
      guards.delete(guard)
      window.removeEventListener('beforeunload', onBeforeUnload)
      navigation?.removeEventListener('navigate', onNavigate)
    }
  }, [dirty, confirm])
}
