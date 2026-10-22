'use client'

import { useState } from 'react'
import { Check, LocateFixed } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { cleanPin, pinFitsCountry, pinMapUrl, type LocationPin } from '@/lib/location-pin'
import s from './checkout.module.css'

// "Share my exact location": optional, only when the customer taps the button (never automatic).
// The position goes with the order so the driver's map opens the exact spot (lib/location-pin.ts).
// A weak signal is still accepted but the customer is told, so they can try again.
const WEAK_ABOVE_METRES = 300

type Step = 'idle' | 'asking' | 'denied' | 'failed' | 'outside'

export default function LocationPinButton({ pin, onChange, countryCode }: { pin: LocationPin | null; onChange: (pin: LocationPin | null) => void; countryCode: string }) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('idle')

  function ask() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setStep('failed'); return }
    setStep('asking')
    navigator.geolocation.getCurrentPosition(
      position => {
        const found = cleanPin({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy })
        if (!found) { setStep('failed'); return }
        if (!pinFitsCountry(found, countryCode)) { onChange(null); setStep('outside'); return }
        onChange(found); setStep('idle')
      },
      error => setStep(error.code === 1 ? 'denied' : 'failed'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  return <div className={s.pinBox}>
    {pin
      ? <>
          <div className={s.pinOk} role="status"><Check size={18} /><span>{t('Your location is saved with this order.')}</span></div>
          {pin.accuracy !== null && pin.accuracy > WEAK_ABOVE_METRES && <p className={s.pinWarn}>{t('The signal is weak (about {metres} m). You can try again.', { metres: pin.accuracy })}</p>}
          <div className={s.pinButtons}>
            <a className={s.pinLink} href={pinMapUrl(pin)} target="_blank" rel="noreferrer">{t('Check on the map')}</a>
            <button type="button" className={s.pinLink} onClick={ask} disabled={step === 'asking'}>{step === 'asking' ? t('Finding you…') : t('Try again')}</button>
            <button type="button" className={s.pinLink} onClick={() => { onChange(null); setStep('idle') }}>{t('Remove')}</button>
          </div>
        </>
      : <>
          <div className={s.pinText}>
            <strong>{t('Help the driver find you')} <i style={{ fontStyle: 'normal', fontWeight: 600 }}>{t('(optional)')}</i></strong>
            <span>{t('Only share it if you are at the delivery address right now. We use it only for your delivery.')}</span>
          </div>
          <div className={s.pinButtons}>
            <button type="button" className={s.pinBtn} onClick={ask} disabled={step === 'asking'}><LocateFixed size={18} />{step === 'asking' ? t('Finding you…') : t('Share my exact location')}</button>
          </div>
        </>}
    {step === 'denied' && <p className={s.pinProblem} role="alert">{t('Location is blocked for this site. Allow it in your browser settings, or skip this step. Your address is enough.')}</p>}
    {step === 'failed' && <p className={s.pinProblem} role="alert">{t('We could not find your location. You can try again, or skip this step.')}</p>}
    {step === 'outside' && <p className={s.pinProblem} role="alert">{t('This location is outside the country we deliver this order to. Please write your address instead.')}</p>}
  </div>
}
