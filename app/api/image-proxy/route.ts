import dns from 'node:dns/promises'
import { NextResponse } from 'next/server'

function blockedHost(hostname:string){
  const h=hostname.toLowerCase().replace(/^\[|\]$/g,'')
  if(h==='localhost'||h==='127.0.0.1'||h==='0.0.0.0'||h==='::1') return true
  if(/^10\./.test(h)||/^192\.168\./.test(h)||/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if(/^169\.254\./.test(h)||h==='169.254.169.254'||h==='metadata.google.internal') return true
  if(h==='::ffff:127.0.0.1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80:')) return true
  return false
}

function blockedAddress(address:string){
  const normalized=address.toLowerCase()
  if(blockedHost(normalized)) return true
  if(normalized.startsWith('::ffff:')) return blockedAddress(normalized.slice(7))
  return false
}

async function assertPublicHostname(hostname:string){
  if(blockedHost(hostname)) throw new Error('Blocked host')
  // Resolve before every upstream request/redirect and reject private/link-local
  // answers. This prevents the proxy from being used to reach internal services
  // through a hostname that resolves to a private address.
  const records=await dns.lookup(hostname,{all:true,verbatim:true})
  if(!records.length||records.some(record=>blockedAddress(record.address))) throw new Error('Blocked host')
}

function normalizeRemote(raw:string){
  let value=raw.trim()
  try{
    const u=new URL(value)
    if(u.hostname==='drive.google.com'){
      const file=u.pathname.match(/^\/file\/d\/([^/]+)/)?.[1] || u.searchParams.get('id')
      if(file) value=`https://drive.google.com/uc?export=download&id=${encodeURIComponent(file)}`
    }
    if(u.hostname.endsWith('dropbox.com')){
      u.searchParams.set('dl','1')
      value=u.toString()
    }
  }catch{}
  return value
}

async function fetchSafeImage(initial:string){
  let current=initial
  for(let redirects=0;redirects<=3;redirects++){
    const parsed=new URL(current)
    if(!['http:','https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol')
    await assertPublicHostname(parsed.hostname)

    const upstream=await fetch(parsed.toString(),{
      headers:{'user-agent':'Mozilla/5.0 EcommercePro Image Proxy'},
      redirect:'manual',
      cache:'no-store',
      signal:AbortSignal.timeout(12000),
    })

    if(upstream.status>=300&&upstream.status<400){
      const location=upstream.headers.get('location')
      if(!location) throw new Error('Invalid upstream redirect')
      current=new URL(location,parsed).toString()
      continue
    }

    return {upstream,parsed}
  }
  throw new Error('Too many upstream redirects')
}

export async function GET(req:Request){
  try{
    const raw=new URL(req.url).searchParams.get('url')||''
    if(!raw) return new NextResponse('Missing url',{status:400})
    const target=normalizeRemote(raw)
    let parsed:URL
    try{ parsed=new URL(target) }catch{return new NextResponse('Invalid url',{status:400}) }
    if(!['http:','https:'].includes(parsed.protocol)) return new NextResponse('Unsupported protocol',{status:400})
    await assertPublicHostname(parsed.hostname)

    const {upstream}=await fetchSafeImage(parsed.toString())
    if(!upstream.ok) return new NextResponse(`Upstream image request failed: ${upstream.status}`,{status:502})

    const contentType=upstream.headers.get('content-type')||''
    if(!contentType.toLowerCase().startsWith('image/')) return new NextResponse('URL did not return an image',{status:415})

    const length=Number(upstream.headers.get('content-length')||0)
    if(length>10*1024*1024) return new NextResponse('Image is too large',{status:413})

    const body=await upstream.arrayBuffer()
    if(body.byteLength>10*1024*1024) return new NextResponse('Image is too large',{status:413})
    const headers=new Headers()
    headers.set('content-type',contentType)
    headers.set('cache-control','public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800')
    headers.set('content-length',String(body.byteLength))
    return new NextResponse(body,{status:200,headers})
  }catch(e){
    const message=e instanceof Error?e.message:'Unable to load image'
    const status=message==='Blocked host'?403:message==='Unsupported protocol'||message==='Invalid url'?400:message==='Image is too large'?413:502
    return new NextResponse(message,{status})
  }
}
