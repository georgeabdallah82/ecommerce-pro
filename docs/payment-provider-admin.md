# Payment provider administration

Use **Admin → Settings → Payments** to control which payment methods are available at checkout.

## Recommended workflow

1. Enable only the methods you currently accept.
2. For online card payments, select the configured provider and enter its credentials.
3. Keep gateway secrets in the provider configuration; never put credentials in storefront settings.
4. For bank transfer and wallet, enter the customer-facing account details and instructions.
5. Save settings and verify checkout shows exactly the enabled methods.

## Going live with a custom domain

Keep the public application URL configurable. When the store moves from the development Render URL to the purchased domain, update the public URL environment setting rather than changing payment-provider code.

## Adding another gateway

A new online gateway should implement the existing payment-provider contract and be registered by provider key. Checkout should select the provider by configuration; gateway-specific API credentials and callback behavior must remain inside that provider.
