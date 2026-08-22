import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { hasPermission, type Permission } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { LogOut, Store, ShieldCheck, Palette, Menu, FileText, Settings2, ShoppingBag, Users, Tag, Truck, BarChart3, Boxes, FolderTree, Layers3, MessageSquare, Image as ImageIcon, UserCog, Activity, LayoutDashboard } from 'lucide-react'

const links: Array<[string,string,Permission,any]> = [
 ['/admin','Dashboard','dashboard.view',LayoutDashboard],
 ['/admin/orders','Orders','orders.view',ShoppingBag],
 ['/admin/products','Products','products.view',Boxes],
 ['/admin/inventory','Inventory','inventory.view',Boxes],
 ['/admin/customers','Customers','customers.view',Users],
 ['/admin/categories','Categories','categories.view',FolderTree],
 ['/admin/collections','Collections','collections.view',Layers3],
 ['/admin/coupons','Discounts','coupons.view',Tag],
 ['/admin/reviews','Reviews','reviews.view',MessageSquare],
 ['/admin/shipping','Shipping','shipping.view',Truck],
 ['/admin/online-store','Online Store','content.view',Store],
 ['/admin/online-store/theme-editor','Theme editor','content.view',Palette],
 ['/admin/online-store/navigation','Navigation','content.view',Menu],
 ['/admin/content','Content','content.view',FileText],
 ['/admin/media','Files','media.view',ImageIcon],
 ['/admin/reports','Analytics & reports','reports.view',BarChart3],
 ['/admin/users','Users & roles','users.view',UserCog],
 ['/admin/activity','Activity log','activity.view',Activity],
 ['/admin/settings','Settings','settings.view',Settings2]
]
export default async function AdminLayout({children}:{children:React.ReactNode}){const user=await getCurrentUser();if(!user||user.role==='CUSTOMER')redirect('/account/login');const visible=links.filter(([, ,permission])=>hasPermission(user.role,permission));return <div className="adminShell"><aside className="adminSide"><div className="adminBrand"><div className="adminBrandMark"><ShieldCheck size={18}/></div><div><div className="logo">Control Center</div><div className="muted" style={{fontSize:12}}>Store operations</div></div></div><div className="pill" style={{margin:'18px 0'}}>{user.role}</div><nav aria-label="Admin navigation">{visible.map(([href,label,permission,Icon])=><Link key={href} href={href}><Icon size={16}/><span>{label}</span></Link>)}</nav><div className="adminSideBottom"><Link href="/"><Store size={16}/> View storefront</Link><form action="/api/auth/logout" method="post"><button className="sideButton" type="submit"><LogOut size={16}/> Sign out</button></form></div></aside><section className="adminMain"><header className="adminTopbar"><div><div className="muted" style={{fontSize:12}}>SIGNED IN AS</div><strong>{user.name}</strong></div><div className="pill">{user.email}</div></header>{children}</section></div>}
