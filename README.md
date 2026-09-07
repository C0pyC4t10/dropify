# Dropify — Multi-tenant Operations Console

> Dropify is a multi-tenant operations platform for any business. Each
> **company** owns its own catalog, orders, suppliers, riders, customers
> (shared across tenants), settings, and categories. One install, many
> businesses, zero code changes per tenant.

Originally built as the meat-delivery ops console for Bazarey Ltd; Dropify
is the platform-name successor. The meat company is seeded automatically
as `id=1, slug='meat'` for backward compatibility.

## Features

### Operator surface (per-company)

- **Dashboard** — today/month KPIs, low-stock alerts, active orders
- **Orders** — full lifecycle (`new → confirmed → preparing → out-for-delivery → delivered`), rider assignment, invoice printing
- **Stock** — per-tenant product catalog with cost/sell/market pricing, reorder levels, stock-in/out adjustments, movement log
- **Purchase Orders** — supplier POs that auto-increment stock and update cost price on receipt
- **Suppliers** — per-tenant directory
- **Riders** — **shared across tenants** (one rider delivers for multiple companies)
- **Customers** — **shared across tenants** (one person can buy from multiple companies)
- **Expenses** — operational costs
- **POS printing** — one-click receipt to a thermal printer
- **Dhaka Metro areas** — searchable dropdown with 150+ areas, "Other" fallback
- **WordPress / Facebook orders** — manual entry + inbound webhook with company-resolution

### Dropify admin console (`/admin`)

The admin console is the heart of the multi-tenant system. It gives you full
control over every company, every category, every unit, and the whole
cross-company system at a glance.

- **`/admin`** — system overview: total companies, total orders across all
  tenants, total revenue, total customers, total riders, total products
- **`/admin/companies`** — create / edit / delete companies; manage
  per-tenant branding (name, tagline, logo URL, accent color); set the
  active company; view per-company quick-stats
- **`/admin/categories`** — per-tenant category CRUD with sort order,
  slug, isActive toggle. Each tenant manages its own catalog taxonomy.
- **`/admin/units`** — per-tenant unit CRUD (kg / pcs / dozen / litre / ...).
  Each tenant measures products the way their business does.
- **`/admin/settings`** — platform-wide settings (work in progress)

### Category-wise management

Categories and units are **first-class tables** per tenant (not enum
constants). Meat company gets Beef / Chicken / Mutton / Offal / Fish; a
fashion company gets Tops / Bottoms / Footwear / Bags / Accessories;
each tenant can rename, reorder, or add categories at will. Products
belong to exactly one category.

## Quick Start

```powershell
npm install
npm run dev
# open http://localhost:3000
```

Production:
```powershell
npm run build
npm run start
```

## Data

All state lives in a SQLite file at `data/meat_delivery.db` (auto-created on
first run). Back this file up nightly to preserve your data.

## Tech Stack

- Next.js 16 (App Router) · React 19 · TypeScript (strict)
- Tailwind CSS 4
- SQLite via `better-sqlite3`, multi-tenant via `companyId` columns + composite indexes
- `pdf-to-printer` + `sharp` for POS receipt generation
- lucide-react · date-fns

## License

Proprietary — © Bazarey Ltd / Skarbol Tech. All rights reserved.
