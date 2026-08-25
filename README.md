# Bazarey Meat Delivery — Operations Console

> Standalone management console for the Bazarey meat delivery brand: orders, invoice printing, rider assignment, stock management, purchase orders, and POS printer integration.

This is the **back-office** operations app — the public ordering website is a separate project.

## Features

- **Dashboard** — today/month KPIs, low-stock alerts, active orders
- **Orders** — create, status flow (`new → confirmed → preparing → out-for-delivery → delivered`), rider assignment, **invoice printing** (browser print + direct POS)
- **Stock** — meat catalog with cost/sell/market pricing, reorder levels, stock-in/out adjustments, movement log
- **Purchase Orders** — supplier POs that auto-increment stock and update cost price on receipt
- **Riders** — CRUD + active/inactive + per-rider delivery stats (own-rider only)
- **Customers** — directory, lifetime spend, auto-saved on order creation
- **Pathao delivery** — separate tracking for hired external riders (Pathao tracking ID + fare)
- **POS printing** — one-click receipt to Xprinter XP-350BM (80mm thermal)
- **Dhaka Metro areas** — searchable dropdown with 150+ areas, "Other" fallback
- **WordPress / Facebook orders** — manual entry with auto-save of new customers by phone

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

All state lives in a single JSON file at `data/db.json` (auto-created on first run). Back this file up nightly to preserve your orders/customers/stock.

## Tech Stack

- Next.js 16 (App Router) · React 19 · TypeScript (strict)
- Tailwind CSS 4
- JSON file store with in-memory cache (`globalThis`) + debounced writes
- `pdf-to-printer` + `sharp` for POS receipt generation
- lucide-react · date-fns

## License

Proprietary — © Bazarey Ltd / Skarbol Tech. All rights reserved.