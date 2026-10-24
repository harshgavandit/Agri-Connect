# AgriConnect

An agricultural marketplace where farmers and sellers list products, buyers discover and order them, and authorised staff manage catalogue, seller and order operations.

[Visit AgriConnect](https://agri-connect-flame.vercel.app) · [Upstream project](https://github.com/c-PRESENTS/Agri-Connect) · [CI](.github/workflows/ci.yml)

## Project context and contributions

This repository extends the [original c-PRESENTS/Agri-Connect project](https://github.com/c-PRESENTS/Agri-Connect). Harsh Gavand contributes to its marketplace and administration workflows. Merged upstream work includes:

- [Organisation RBAC foundation and marketplace experience, PR #15](https://github.com/c-PRESENTS/Agri-Connect/pull/15): organisation roles and permissions, server-side permission middleware, same-organisation access boundaries and protection for the final super-administrator.
- [Checkout hardening, PR #19](https://github.com/c-PRESENTS/Agri-Connect/pull/19): validated checkout requests, stage-specific failures and CAPTCHA retry handling.
- [Administrator security workspace, PR #25](https://github.com/c-PRESENTS/Agri-Connect/pull/25): admin control-centre and security UI work integrating existing TOTP helpers.

The linked pull requests show the actual diffs, review state and merge history. This branch also contains later application and deployment changes.

## Buying and selling

- Browse produce, groceries, livestock, farming inputs, tools and other agricultural products by category.
- Search products, compare listings, save favourites and view seller profiles.
- Find nearby sellers and listings on the map.
- Add products to a cart, choose a delivery address, review the price breakdown and place an order.
- View order details and payment status from your account.
- Create product listings and manage incoming orders through the seller dashboard.

Stripe and Razorpay checkout are currently configured for **test payments**.

## More in the app

- **AI assistance:** Ask marketplace questions, search for products, translate text and interpret voice commands for navigation.
- **Logistics:** Shipping estimates, shipment tracking and delivery collaboration options.
- **Land:** Agricultural land listings.
- **Share & Care:** Community sharing listings.
- **Farmer resources:** Farming information, government schemes and agricultural technology resources.
- **Student portal:** Student resources and support requests.
- **Language and accessibility settings:** Interface language and accessibility preferences.

The control centre lets authorised staff manage users, sellers, listings, categories, orders and verification requests. Staff operations use roles, permissions and audit records.

## Architecture

```text
React / TypeScript marketplace and staff interfaces
                        ↓
Express routes → session / permission / request checks
                        ↓
Services and repositories → PostgreSQL / Drizzle
       ├─ Catalogue, orders, payments and verification
       ├─ OpenAI marketplace assistance and search expansion
       └─ Optional maps, geocoding and notification providers
```

- Organisation permissions and administrative operations are enforced on the server, rather than being limited to hidden interface controls.
- Payment code separates attempt state, provider capabilities, refunds, reconciliation and seller release. Test-payment availability does not establish real-money settlement readiness.
- AI routes validate bounded inputs. Chat requires authentication, receives a limited listing sample and cannot place orders or change accounts. Provider outages return controlled errors; search has a deterministic synonym fallback.
- PostgreSQL stores application records and sessions. Integrations remain optional and configuration-dependent.

See [AI routes](backend/modules/ai/routes.ts), [provider configuration](backend/ai/openai.ts), [session/MFA boundaries](backend/auth/session-security.ts), [payment state handling](backend/payments/payment-state-service.ts) and [seller release](backend/payments/protected-funds-service.ts).

## Stack

React, TypeScript, Vite, Express, PostgreSQL, Drizzle, Zod, React Query, Tailwind/Radix UI, Leaflet, OpenAI, Stripe/Razorpay integrations and Playwright.

## Run locally

Use Node.js 22.x and a separate, empty PostgreSQL database for a fresh installation.

```powershell
git clone https://github.com/harshgavandit/Agri-Connect.git
cd Agri-Connect
npm ci
Copy-Item .env.example .env
```

Set `DATABASE_URL`, a long random `SESSION_SECRET`, and the three separate base64 encryption keys: `APP_ENCRYPTION_KEY`, `SELLER_VERIFICATION_ENCRYPTION_KEY` and `SELLER_DOCUMENT_ENCRYPTION_KEY`. Keep the storage path private. Leave `PAYMENTS_MODE=mock` and real payment providers disabled for local exploration.

```powershell
# Writes schema/reference data only to the dedicated fresh application database.
npm run db:setup:fresh
npm run dev
```

The fresh-setup script refuses an existing application database and records completed migration checksums. It deliberately excludes later catalogue-ownership migrations. Do not use it to change an existing installation; inspect [the setup implementation](scripts/setup-fresh-database.mjs) first.

The default local origin is `http://localhost:5000`; keep `PUBLIC_APP_URL` and `APP_ORIGINS` aligned with it. To enable OpenAI features, set `AI_INTEGRATIONS_OPENAI_API_KEY` or `OPENAI_API_KEY`, and optionally `OPENAI_MODEL`. The provider helper also supports `AI_INTEGRATIONS_OPENAI_BASE_URL`. Never prefix server credentials with `VITE_`.

The full sample configuration is in [`.env.example`](.env.example). Optional OAuth, maps, payment and notification features need their own provider configuration.

## Verification

```powershell
npm run check
npm run qa:ai
npm run qa:checkout
npm run qa:links
npm run build
```

[CI](.github/workflows/ci.yml) runs these checks on pushes and pull requests. AI unit tests use synthetic provider responses; they do not spend a live provider key. Playwright suites cover organisation permissions, administration, seller verification, catalogue moderation, payments and marketplace journeys. They require a dedicated configured test environment and are **not** all run by the default CI workflow. See the `qa:*` scripts in [`package.json`](package.json) before selecting a suite.

## Scope and deployment

- Hosted frontend/API routing is defined in [`vercel.json`](vercel.json). Configure credentials privately in the hosting environment; `.env` must not be committed.
- AI answers use a bounded marketplace sample and are not a complete inventory guarantee. The assistant cannot confirm transactions or perform account mutations.
- Checkout is in test mode. Real payment processing, seller payouts and external logistics require provider activation and independent operational acceptance.

Original project: [c-PRESENTS/Agri-Connect](https://github.com/c-PRESENTS/Agri-Connect).
