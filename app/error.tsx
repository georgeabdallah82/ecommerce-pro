'use client'
import Link from 'next/link'
import { useEffect } from 'react'
export default function ErrorPage({reset}:{error:Error & {digest?:string};reset:()=>void}){useEffect(()=>{console.error('Storefront error')},[]);return <main className="section"><div className="container"><div className="card empty"><span className="muted">SOMETHING WENT WRONG</span><h1 className="h2">We couldn't load this page.</h1><p className="muted">Please try again. Your cart and order data are kept safe.</p><div className="inline" style={{justifyContent:'center'}}><button className="btn" onClick={()=>reset()}>Try again</button><Link className="btn secondary" href="/">Back to store</Link></div></div></div></main>}
