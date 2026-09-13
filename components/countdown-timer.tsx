'use client'

import { useEffect, useState } from 'react'

function timeLeft(target: number) {
  const diff = Math.max(0, target - Date.now())
  return {
    done: diff <= 0,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
}

export function CountdownTimer({ launchAt }: { launchAt: string }) {
  const target = launchAt ? new Date(launchAt).getTime() : NaN
  const [state, setState] = useState<ReturnType<typeof timeLeft> | null>(null)

  useEffect(() => {
    if (!Number.isFinite(target)) return
    setState(timeLeft(target))
    const id = setInterval(() => setState(timeLeft(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  if (!Number.isFinite(target) || !state) return null

  if (state.done) {
    return <p className="aliComingSoonLive">We'll be live any moment now.</p>
  }

  const units: Array<[string, number]> = [
    ['Days', state.days],
    ['Hours', state.hours],
    ['Minutes', state.minutes],
    ['Seconds', state.seconds],
  ]

  return (
    <div className="aliComingSoonTimer">
      {units.map(([label, value]) => (
        <div key={label} className="aliComingSoonTimerUnit">
          <strong>{String(value).padStart(2, '0')}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
