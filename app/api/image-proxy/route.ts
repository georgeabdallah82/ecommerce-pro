import {NextResponse} from 'next/server'

function blockedHost(hostname:string){
  const h=hostname.toLowerCase()
  if(h==='localhost'||h==='127.0.0.1'||h==='0.0.0.0'||h==='::1') return true
  if(/^10\./.test(h)||/^192\.168\./.test(h)||/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  return false
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

export async function GET(req:Request){
  try{
    const raw=new URL(req.url).searchParams.get('url')||''
    if(!raw) return new NextResponse('Missing url',{status:400})
    const target=normalizeRemote(raw)
    const parsed=new URL(target)
    if(!['http:','https:'].includes(parsed.protocol)) return new NextResponse('Unsupported protocol',{status:400})
    if(blockedHost(parsed.hostname)) return new NextResponse('Blocked host',{status:403})

    const upstream=await fetch(parsed.toString(),{
      headers:{'user-agent':'Mozilla/5.0 EcommercePro Image Proxy'},
      redirect:'follow',
      cache:'no-store',
      signal:AbortSignal.timeout(12000),
    })
    if(!upstream.ok) return new NextResponse(`Upstream image request failed: ${upstream.status}`,{status:502})

    const contentType=upstream.headers.get('content-type')||''
    if(!contentType.toLowerCase().startsWith('image/')) return new NextResponse('URL did not return an image',{status:415})

    const headers=new Headers()
    headers.set('content-type',contentType)
    headers.set('cache-control','public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800')
    const length=upstream.headers.get('content-length')
    if(length) headers.set('content-length',length)
    return new NextResponse(upstream.body,{status:200,headers})
  }catch(e){
    return new NextResponse(e instanceof Error?e.message:'Unable to load image',{status:502})
  }
}
