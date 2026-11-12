# Owner decisions (2026-11)

Branch `claude/owner-decisions-2026-11`, from `origin/main` at `b19a91a`. It records the owner's answers to the open questions in `docs/payments-hardening-2026-11.md` (D2, D3, D5), and it supersedes the D2 note in `docs/storefront-checkout-audit-2026-11.md`.

## D2: coins count toward the free-delivery threshold

**Decision: yes.**

- Delivery is priced on the merchandise after coupons, automatic discounts and bundles, before coins (`lib/checkout-totals.ts`). Checkout and the price summary share that function, so the Place order total is still the charge.
- Examples, with a threshold of 100.00 and a delivery rate of 5.00:
  - A 198.00 cart paid entirely in coins: delivery 0.00, total 0.00. The order is placed as paid upfront, the same path a gift card that covers the total takes, and its event reads "Order placed successfully using coins."
  - A 90.00 cart with 10.00 of coins: delivery 5.00 (the threshold is judged on 90.00), total 85.00.
- The delivery estimates for the methods the server did not price use the same basis once a quote exists (`app/checkout/page.tsx`). Before the first quote they use the cart subtotal.

**Consequence to confirm:** a cart can now be paid entirely in coins and place at 0.00 with no payment step. Before this change the 5.00 delivery charge kept such an order above zero. Coins are capped at the merchandise. To keep a balance due, that cap would have to change.

## D3: rate limit on the price summary

**Decision: confirmed.** `/api/checkout/quote` allows 120 requests per 10 minutes per IP. Shared mobile carrier addresses are the reason the number is this high. `tests/owner-decisions-2026-11.test.ts` pins it, so a change to the number has to be deliberate.

## D5: the webhook secret moves out of the URL

**Decision: fix.** The gateway's secret goes in its `X-Notification-Secret` header.

What the code does now:

- The webhook accepts the header when its value equals `AREEBA_WEBHOOK_SECRET`.
- It still accepts the token in the URL, so orders placed before the switch are not stranded. Those notifications are logged as "accepted by the legacy URL token".
- Once `AREEBA_WEBHOOK_SECRET` is set, new payment sessions get a notification URL with no token (`lib/payments.ts`).
- A refused notification is logged as a warning. No log line contains the token or the secret.

**Not verified.** The primary Mastercard page (`developer.mastercard.com/mastercard-gateway/documentation/gateway-features/webhook-noti/`) returned 404 from here, so these points come from a search summary of it and are unconfirmed:

- the notification secret is sent in an `X-Notification-Secret` header;
- credentials placed in the notification URL are discarded;
- the endpoint must answer with HTTP 200 within two seconds.

If query-string credentials are discarded, the URL token has never authenticated a notification, and webhooks have been refused since they were enabled. The warning logs added here will show it: after this deploy, look for "refused a notification" in the Worker logs.

**Cutover (owner):**

1. In Merchant Administration, enable webhooks and copy the notification secret.
2. Set the Worker secret `AREEBA_WEBHOOK_SECRET` to that value, for example `npx wrangler secret put AREEBA_WEBHOOK_SECRET`. Do not use `PAYMENT_WEBHOOK_SECRET`. That secret already guards the internal `/api/internal/payment-status` endpoint, and setting it here would drop the token from every new notification URL.
3. Complete a test order. In the Worker logs, look for "accepted by the secret header". If you see "refused a notification" instead, the gateway is not sending the secret the way it was configured. Delete `AREEBA_WEBHOOK_SECRET`, which puts the token back into new notification URLs, and send the details to me.
4. When "accepted by the legacy URL token" has stopped appearing for about a week, the URL-token branch can be removed in a follow-up.

**Also worth checking:** the webhook calls the gateway's status API before it answers. If the two-second limit applies, a slow answer counts as a failed delivery. If the logs show repeated deliveries for one order, the fix is to answer first and process afterwards.

## Still open

- Should invoice links expire? They never do today.
- Confirm that a coin-only cart placing at 0.00 is the behavior you want (see D2).

## Verification

- `npx tsc --noEmit`: exit 0.
- `npm test`: 1,096 passing, 0 failing. Ten tests are new: eight in `tests/owner-decisions-2026-11.test.ts` and two in `tests/checkout-totals.test.ts`.
- `npm run backend:audit`: passed.

Not verified live: the gateway's header behavior, the webhook cutover, and a coin-only order in the browser.
