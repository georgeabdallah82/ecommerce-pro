// The store's public settings (/api/store/settings: payment methods, free-delivery amount,
// contact) for the browser. The header, footer, delivery notes and cart all need them; they
// used to ask the server separately, two or three requests per page view. Now one request per
// page load is shared by all of them (checkout still asks fresh before taking an order).
let request: Promise<any> | null = null

export function loadStoreSettings(): Promise<any> {
  request ??= fetch('/api/store/settings')
    .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .catch(() => {
      request = null // a failed request is asked again by the next part that needs it
      return null
    })
  return request
}
