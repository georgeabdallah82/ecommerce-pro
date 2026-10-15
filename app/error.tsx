'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import { useI18n } from '@/components/lang-provider'
export default function ErrorPage({reset}:{error:Error & {digest?:string};reset:()=>void}){const {t}=useI18n();useEffect(()=>{console.error('Storefront error')},[]);return <main className="section"><div className="container"><div className="card empty"><span className="muted">{t('SOMETHING WENT WRONG')}</span><h1 className="h2">{t("We couldn't load this page.")}</h1><p className="muted">{t('Please try again. Your cart and order data are kept safe.')}</p><div className="inline" style={{justifyContent:'center'}}><button className="btn" onClick={()=>reset()}>{t('Try again')}</button><Link className="btn secondary" href="/">{t('Back to store')}</Link></div></div></div></main>}
