import Link from 'next/link'
import { ArrowLeft, SearchX } from 'lucide-react'
import AdminRouteStateStyles from '@/components/admin-route-state-styles'

export default function AdminNotFound(){return <div className="adminRouteNotFound"><AdminRouteStateStyles/><div className="adminRouteNotFoundIcon"><SearchX size={22}/></div><div><span>404 · CONTROL CENTER</span><h1>We couldn't find that page.</h1><p>The requested record or admin section doesn't exist, or may have moved.</p><Link className="btn" href="/admin"><ArrowLeft size={14}/> Back to dashboard</Link></div></div>}
