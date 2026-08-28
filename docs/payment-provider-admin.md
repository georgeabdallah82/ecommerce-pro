# Payment provider administration

Use **Admin → Settings → Payments** to control payment methods.

- COD: enable or disable.
- Card: choose the configured online provider and keep credentials in provider configuration.
- Bank transfer: configure bank name, account name, IBAN and customer instructions.
- Wallet: configure provider, account name/number and customer instructions.

Never expose gateway secrets through public storefront settings. When the store moves from the development Render URL to a custom domain, update the public URL environment setting rather than changing payment-provider code.

A future gateway should implement the existing payment-provider contract and be registered by provider key. Checkout should select the provider by configuration; gateway-specific credentials and callback behavior stay inside the provider.
