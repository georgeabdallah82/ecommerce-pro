'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/components/cart-provider'
import { money } from '@/lib/config'

export default function Checkout() {
  const { items, subtotal, clear } = useCart()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!items.length) {
      setError('Your cart is empty.')
      return
    }

    setLoading(true)

    const form = event.currentTarget
    const fd = new FormData(form)

    const data = {
      email: String(fd.get('email') || ''),
      phone: String(fd.get('phone') || ''),
      paymentMethod: String(
        fd.get('paymentMethod') || 'COD'
      ),
      couponCode: String(
        fd.get('couponCode') || ''
      ),

      shippingAddress: {
        firstName: String(
          fd.get('firstName') || ''
        ),
        lastName: String(
          fd.get('lastName') || ''
        ),
        line1: String(
          fd.get('line1') || ''
        ),
        line2: String(
          fd.get('line2') || ''
        ),
        city: String(
          fd.get('city') || ''
        ),
        region: String(
          fd.get('region') || ''
        ),
        postalCode: String(
          fd.get('postalCode') || ''
        ),
        country: String(
          fd.get('country') || ''
        ),
        phone: String(
          fd.get('phone') || ''
        ),
      },

      items: items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId || null,
        quantity: item.quantity,
      })),
    }

    try {
      const response = await fetch(
        '/api/checkout',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      )

      const output = await response.json()

      if (!response.ok) {
        throw new Error(
          output.error ||
            'Unable to place order'
        )
      }

      clear()

      router.push(
        `/order/success?order=${encodeURIComponent(
          output.order.orderNumber
        )}`
      )
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to place order'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="section">
      <div className="container split">
        <form
          className="card checkoutForm"
          onSubmit={submit}
        >
          <span className="muted">
            CHECKOUT
          </span>

          <h1 className="h2">
            Secure, simple, fast.
          </h1>

          <h3>Contact</h3>

          <input
            className="input"
            required
            name="email"
            type="email"
            placeholder="Email"
          />

          <input
            className="input"
            name="phone"
            placeholder="Phone"
          />

          <h3>Delivery</h3>

          <div className="grid two">
            <input
              className="input"
              required
              name="firstName"
              placeholder="First name"
            />

            <input
              className="input"
              required
              name="lastName"
              placeholder="Last name"
            />
          </div>

          <input
            className="input"
            required
            name="line1"
            placeholder="Address"
          />

          <input
            className="input"
            name="line2"
            placeholder="Apartment, floor, etc. (optional)"
          />

          <div className="grid two">
            <input
              className="input"
              required
              name="city"
              placeholder="City"
            />

            <input
              className="input"
              name="region"
              placeholder="Region"
            />
          </div>

          <div className="grid two">
            <input
              className="input"
              name="postalCode"
              placeholder="Postal code"
            />

            <input
              className="input"
              required
              name="country"
              placeholder="Country"
              defaultValue="Lebanon"
            />
          </div>

          <h3>Payment</h3>

          <select
            className="input"
            name="paymentMethod"
            defaultValue="COD"
          >
            <option value="COD">
              Cash on delivery
            </option>

            <option value="CARD">
              Card (connect gateway later)
            </option>

            <option value="BANK_TRANSFER">
              Bank transfer
            </option>

            <option value="WALLET">
              Wallet
            </option>
          </select>

          <input
            className="input"
            name="couponCode"
            placeholder="Coupon code (optional)"
          />

          {error && (
            <div className="alert">
              {error}
            </div>
          )}

          <button
            className="btn"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Placing order…'
              : 'Place order'}
          </button>

          <Link
            className="textLink"
            href="/cart"
          >
            Back to cart
          </Link>
        </form>

        <aside className="card summaryCard">
          <span className="muted">
            ORDER SUMMARY
          </span>

          {items.map((item) => (
            <div
              className="summaryLine"
              key={
                item.productId +
                String(item.variantId)
              }
            >
              <span>
                {item.name} × {item.quantity}
              </span>

              <strong>
                {money(
                  item.price *
                    item.quantity
                )}
              </strong>
            </div>
          ))}

          <div className="summaryLine total">
            <span>
              Total before shipping
            </span>

            <strong>
              {money(subtotal)}
            </strong>
          </div>

          <p className="muted">
            Shipping is calculated from your
            delivery area and may vary by zone.
          </p>
        </aside>
      </div>
    </main>
  )
}
