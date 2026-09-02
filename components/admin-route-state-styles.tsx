'use client'

export default function AdminRouteStateStyles(){
  return <style jsx global>{`
    .adminRouteState{min-height:280px;display:flex;align-items:center;justify-content:center;gap:12px;border:1px solid #e1e3dd;border-radius:18px;background:#fff;box-shadow:0 4px 18px rgba(23,23,23,.04);color:#262823;padding:32px}
    .adminRouteSpinner{width:28px;height:28px;border:3px solid #e1e3dd;border-top-color:#171817;border-radius:50%;animation:adminSpin .75s linear infinite}
    .adminRouteState strong{font-size:14px}
    .adminRouteState p{margin:4px 0 0;color:#868a82;font-size:11px}
    .adminRouteNotFound{min-height:320px;display:flex;align-items:center;justify-content:center;gap:18px;padding:34px;border:1px solid #e1e3dd;border-radius:20px;background:#fff;box-shadow:0 10px 28px rgba(23,23,23,.045)}
    .adminRouteNotFoundIcon{display:grid;place-items:center;width:52px;height:52px;border-radius:15px;background:#f1f2ef;color:#51564f}
    .adminRouteNotFound span{font-size:10px;letter-spacing:.11em;font-weight:900;color:#858a82}
    .adminRouteNotFound h1{margin:7px 0 5px;font-size:25px;letter-spacing:-.04em}
    .adminRouteNotFound p{margin:0 0 15px;color:#777b74;font-size:12px;line-height:1.6}
    .adminRouteNotFound .btn{display:inline-flex}
    @keyframes adminSpin{to{transform:rotate(360deg)}}
    html[data-admin-theme='dark'] .adminRouteState{background:#191d1b;color:#eef2ef;border-color:#2c332e}
    html[data-admin-theme='dark'] .adminRouteSpinner{border-color:#343b36;border-top-color:#eef2ef}
    html[data-admin-theme='dark'] .adminRouteState p{color:#9da69f}
    html[data-admin-theme='dark'] .adminRouteNotFound{background:#191d1b;color:#eef2ef;border-color:#2c332e}
    html[data-admin-theme='dark'] .adminRouteNotFoundIcon{background:#242a27;color:#c4cec7}
    html[data-admin-theme='dark'] .adminRouteNotFound span,html[data-admin-theme='dark'] .adminRouteNotFound p{color:#9da69f}
  `}</style>
}
