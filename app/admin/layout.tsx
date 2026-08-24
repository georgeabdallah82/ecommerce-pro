import Link from 'next/link'
import './inventory/inventory-admin.css'
import { getCurrentUser } from '@/lib/auth'
import { hasPermission, type Permission } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import OrderAlerts from '@/components/order-alerts'
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

const adminCss = `
body:has(.adminShell) { background:#f6f6f4; }
body:has(.adminShell) > .nav, body:has(.adminShell) .nav { display:none !important; }
body:has(.adminShell) .adminShell { min-height:100vh; grid-template-columns:250px minmax(0,1fr); background:#f6f6f4; }
body:has(.adminShell) .adminSide { position:sticky; top:0; height:100vh; padding:18px 14px; background:#fff; border-right:1px solid #e5e5e0; overflow:auto; }
body:has(.adminShell) .adminSide nav { margin-top:12px; }
body:has(.adminShell) .adminSide nav a { display:flex; align-items:center; gap:10px; height:42px; padding:0 12px; margin:3px 0; border-radius:10px; color:#5d5d59; font-size:14px; font-weight:600; transition:background .15s ease,color .15s ease,transform .15s ease; }
body:has(.adminShell) .adminSide nav a:hover { background:#f1f1ed; color:#171717; transform:translateX(1px); }
body:has(.adminShell) .adminSide nav a svg { flex:none; opacity:.85; }
body:has(.adminShell) .adminSideBottom { margin-top:14px; padding-top:14px; }
body:has(.adminShell) .adminSideBottom a, body:has(.adminShell) .sideButton { height:40px; font-size:13px; }
body:has(.adminShell) .adminMain { min-width:0; padding:0 34px 48px; }
body:has(.adminShell) .adminTopbar { position:sticky; top:0; z-index:40; min-height:76px; padding:0; margin:0 0 28px; background:rgba(246,246,244,.94); backdrop-filter:blur(14px); border-bottom:1px solid #e6e6e2; }
body:has(.adminShell) .adminTopbar > div:first-child { padding:12px 0; }
body:has(.adminShell) .adminBrand .logo { font-size:16px; letter-spacing:-.03em; }
body:has(.adminShell) .adminBrandMark { width:36px; height:36px; border-radius:11px; }
body:has(.adminShell) .pill { border:1px solid #e6e6e0; background:#fff; color:#4d4d48; }
body:has(.adminShell) .sectionHead { margin-bottom:22px; }
body:has(.adminShell) .catalogPage { max-width:1480px; margin:0 auto; }
body:has(.adminShell) .catalogHead { align-items:center; }
body:has(.adminShell) .catalogHead .h2 { font-size:38px; letter-spacing:-.045em; }
body:has(.adminShell) .catalogHead .muted { font-size:14px; }
body:has(.adminShell) .catalogStats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:0 0 16px; }
body:has(.adminShell) .statCard { appearance:none; width:100%; padding:16px 18px; border:1px solid #e4e4df; border-radius:14px; background:#fff; text-align:left; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,.03); transition:border .15s ease,box-shadow .15s ease,transform .15s ease; }
body:has(.adminShell) .statCard:hover { border-color:#cfcfc8; box-shadow:0 5px 18px rgba(0,0,0,.05); transform:translateY(-1px); }
body:has(.adminShell) .statCard.active { border-color:#171717; box-shadow:0 0 0 1px #171717 inset; }
body:has(.adminShell) .statCard span { display:block; font-size:12px; }
body:has(.adminShell) .statCard strong { display:block; margin-top:6px; font-size:25px; line-height:1; letter-spacing:-.03em; }
body:has(.adminShell) .catalogToolbar { display:grid; grid-template-columns:minmax(320px,1.4fr) auto minmax(300px,.9fr); gap:10px; align-items:center; padding:12px; margin-bottom:14px; border-radius:15px; overflow:visible; box-shadow:0 1px 2px rgba(0,0,0,.02); }
body:has(.adminShell) .productSearch { max-width:none; height:44px; border-radius:10px; }
body:has(.adminShell) .catalogFilters { display:grid; grid-template-columns:1fr 1fr auto; gap:10px; align-items:center; }
body:has(.adminShell) .catalogFilters .input { min-width:0; }
body:has(.adminShell) .mobileFilterBtn { display:none; }
body:has(.adminShell) .catalogToolbar .btn { min-height:44px; }
body:has(.adminShell) .bulkBar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; margin-bottom:12px; border:1px solid #d9d9d2; border-radius:12px; background:#fff; position:sticky; top:78px; z-index:25; box-shadow:0 6px 18px rgba(0,0,0,.05); }
body:has(.adminShell) .productTableCard { border-radius:15px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
body:has(.adminShell) .tableTopline { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid #ededeb; }
body:has(.adminShell) .tableTopline .input.compact { height:34px; min-width:74px; }
body:has(.adminShell) .productTable { min-width:980px; }
body:has(.adminShell) .productTable th { background:#fbfbf9; padding:12px 14px; font-size:11px; text-transform:uppercase; letter-spacing:.06em; border-bottom:1px solid #e8e8e3; }
body:has(.adminShell) .productTable td { padding:13px 14px; height:68px; vertical-align:middle; }
body:has(.adminShell) .productTable tbody tr:hover { background:#fcfcfa; }
body:has(.adminShell) .productTable tbody tr.selectedRow { background:#f3f3ef; }
body:has(.adminShell) .productListName { min-width:280px; }
body:has(.adminShell) .productThumb { width:48px; height:48px; border-radius:10px; background:#f5f5f1; }
body:has(.adminShell) .productThumb span { color:#999; font-size:20px; }
body:has(.adminShell) .productThumb img { object-fit:cover; }
body:has(.adminShell) .statusPill { padding:6px 9px; border:1px solid transparent; }
body:has(.adminShell) .stockCell { display:grid; gap:2px; }
body:has(.adminShell) .stockCell strong { font-size:14px; }
body:has(.adminShell) .stockCell span { font-size:11px; }
body:has(.adminShell) .table .iconBtn { width:34px; height:34px; border-radius:9px; }
body:has(.adminShell) .catalogPagination { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-top:1px solid #ededeb; }
body:has(.adminShell) .alert { margin-bottom:12px; }
body:has(.adminShell) .btn { box-shadow:0 1px 1px rgba(0,0,0,.04); transition:transform .15s ease,box-shadow .15s ease; }
body:has(.adminShell) .btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 5px 14px rgba(0,0,0,.08); }
body:has(.adminShell) .btn:disabled { opacity:.55; cursor:not-allowed; }
body:has(.adminShell) .input:focus, body:has(.adminShell) .textarea:focus { outline:none; border-color:#8e8e87; box-shadow:0 0 0 3px rgba(23,23,23,.06); }
@media (max-width:1100px){ body:has(.adminShell) .adminShell{grid-template-columns:220px minmax(0,1fr)} body:has(.adminShell) .adminMain{padding-left:24px;padding-right:24px} body:has(.adminShell) .catalogToolbar{grid-template-columns:1fr auto}.catalogFilters{grid-column:1 / -1} }
@media (max-width:800px){ body:has(.adminShell) .adminShell{grid-template-columns:1fr} body:has(.adminShell) .adminSide{position:relative;top:auto;height:auto;border-right:0;border-bottom:1px solid #e5e5e0} body:has(.adminShell) .adminMain{padding:0 14px 34px} body:has(.adminShell) .adminTopbar{position:relative;min-height:68px;margin-bottom:18px} body:has(.adminShell) .catalogStats{grid-template-columns:repeat(2,minmax(0,1fr))} body:has(.adminShell) .catalogToolbar{grid-template-columns:1fr auto} body:has(.adminShell) .mobileFilterBtn{display:inline-flex} body:has(.adminShell) .catalogFilters{display:none;grid-column:1 / -1;grid-template-columns:1fr} body:has(.adminShell) .catalogFilters.open{display:grid} body:has(.adminShell) .productTable{min-width:900px} }
@media (max-width:520px){ body:has(.adminShell) .catalogStats{grid-template-columns:1fr 1fr} body:has(.adminShell) .catalogHead{align-items:flex-start;flex-direction:column} body:has(.adminShell) .catalogHead .btn{width:100%} body:has(.adminShell) .adminTopbar{align-items:flex-start} }
`

export default async function AdminLayout({children}:{children:React.ReactNode}){
 const user=await getCurrentUser(); if(!user||user.role==='CUSTOMER') redirect('/account/login'); const visible=links.filter(([, ,permission])=>hasPermission(user.role,permission)); return <><style dangerouslySetInnerHTML={{__html:adminCss}} /><div className="adminShell"><aside className="adminSide"><div className="adminBrand"><div className="adminBrandMark"><ShieldCheck size={18}/></div><div><div className="logo">Control Center</div><div className="muted" style={{fontSize:12}}>Store operations</div></div></div><div className="pill" style={{margin:'18px 0'}}>{user.role}</div><nav aria-label="Admin navigation">{visible.map(([href,label,permission,Icon])=><Link key={href} href={href}><Icon size={16}/><span>{label}</span></Link>)}</nav><div className="adminSideBottom"><Link href="/"><Store size={16}/> View storefront</Link><form action="/api/auth/logout" method="post"><button className="sideButton" type="submit"><LogOut size={16}/> Sign out</button></form></div></aside><section className="adminMain"><header className="adminTopbar"><div><div className="muted" style={{fontSize:12}}>SIGNED IN AS</div><strong>{user.name}</strong></div><div className="inline"><OrderAlerts vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}/><div className="pill">{user.email}</div></div></header>{children}</section></div></> }
