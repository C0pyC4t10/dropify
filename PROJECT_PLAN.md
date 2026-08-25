# Meat Delivery — Comprehensive Project Plan & Study

**Project:** Standalone meat supply & delivery brand (operations management)
**Location:** `C:\Bazarey2.0\Meat Delivery`
**Version:** 1.0
**Date:** August 2026
**Owner:** Bazarey Ltd / Skarbol Tech

---

## 1. Executive Summary

Bazarey is expanding into a **dedicated meat supply & delivery brand**. The public facing **ordering website already exists**; what is missing is the **management / back-office layer**. This app is that layer: it handles **orders**, **invoice printing**, **rider assignment**, **stock/inventory management**, **customers** and **riders** — everything the daily operations staff need to run deliveries.

This project delivers a working, self-contained operations console (Next.js + local JSON store) ready to be used immediately, with no external services required.

---

## 2. Market Study — Bangladesh Meat Market (2026)

### Prices observed (Dhaka retail, mid-2026)

| Meat | Retail price | Notes |
|---|---|---|
| Beef (boneless) | ৳780–820/kg | Down from ৳850 peak |
| Beef (with bone) | ৳680–750/kg | |
| Broiler chicken | ৳160–185/kg | Seasonal, rising with rain/supply |
| Sonali cock chicken | ৳320–355/kg | Premium |
| Layer chicken | ৳340–400/kg | |
| Mutton | ৳1,250–1,300/kg | Highest-margin meat |
| Hilsa fish | ৳1,200–1,300/kg | Seasonal |

> Sources: Dhaka Tribune, bdnews24, The Business Standard, TBS, Network Bangladesh (May–Jul 2026). Seed data in the app uses these figures.

### Key dynamics

- Meat is a **daily, high-frequency purchase** with inherently low retailer margins (target 15–25%).
- **Freshness is the #1 differentiator** — customers buy meat they trust is fresh.
- Chicken is the volume driver (affordable); beef is festival-driven (Eid surges); mutton is premium.
- Online meat delivery is still underserved in Dhaka vs packaged groceries — opportunity for a dedicated, trust-branded player.
- Markup must track **daily market rate + margin**, never fixed MRP.

### Pricing strategy for the new brand

| Cut | Market (৳/kg) | Brand sell (৳/kg) | Position |
|---|---|---|---|
| Beef boneless | 800 | 730–780 | Slightly under market = value |
| Broiler chicken | 180 | 245 (cuts) / 170 (whole) | Cut premium, whole = volume |
| Sonali cock | 355 | 340 | Premium freshness |
| Mutton | 1,300 | 1,200–1,250 | Premium margin carrier |

The app's stock page tracks **market price vs sell price vs cost** per product so margins are always visible.

---

## 3. Vision & Mission

- **Vision:** Become Dhaka's most trusted doorstep meat brand — premium cuts, honest pricing, on-time delivery.
- **Mission for this tool:** Give the operations team a single screen to run every delivery order — create it, print its invoice, assign a rider, track it to "delivered", and keep stock accurate — with zero paperwork loss.

---

## 4. Scope

### In scope (v1.0)
- Dashboard with live today/this-month KPIs, low-stock alerts, active orders, active riders
- Order management: create (with product/qty/price), filter by status, search
- **Invoice printing** (print-optimized A5 layout: items, totals, paid, due)
- Order status flow with **auto stock management** (deduct on create, restore on cancel)
- **Rider assignment** + rider registry (active/inactive, load counts)
- Product/inventory: catalog, reorder levels, stock in/out (purchase/wastage), movement history, margin %
- Customer registry with lifetime spend and phone dial links
- Settings (brand identity, delivery fees, invoice note)
- Local JSON persistence — fully portable, zero cost

### Out of scope (v1.0)
- Public ordering website (exists separately)
- Payments gateway integration (COD tracked manually via `paid`)
- Auth / multi-user permissions (single-team local tool)
- Cloud database, POS hardware, mobile apps

### Planned (v1.1+)
- WhatsApp order intake auto-creation
- Delivery zone maps & rider GPS tracking
- Daily COD reconciliation report
- B2B bulk orders (restaurants/caterers)
- Reports: sales by cut, wastage %, rider performance
- Backup/restore UI

---

## 5. Business Logic

### Order flow
```
new → confirmed → preparing → out-for-delivery → delivered
        (or)                             ↓
                                    cancelled (stock restored)
```

### Stock rules
- **Create order** → each line deducts from product stock, logged as a `sale` movement.
- **Cancel order** → stock restored (avoids phantom stock loss on cancelled COD).
- Reorder when `stockQty <= reorderLevel` → flagged as LOW Stock.

### Invoice
- Auto number `MD-2026-0001` from internal id sequence.
- Shows business brand identity, customer bill-to, delivery info, items table, subtotal/delivery/discount/total, paid method + paid amount + **due**.
- A5 print CSS; `Print Invoice` hides chrome.

---

## 6. Architecture

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 + React 19 | App Router, same stack as Bazarey ecosystem |
| Language | TypeScript (strict) | Type safety across data flows |
| Data | JSON store (`data/db.json`) | Zero infra, portable, debuggable, instantly seedable |
| Styling | Tailwind 4 + CSS vars | Dark ops theme, consistent tokens |
| Icons | lucide-react | Consistent tree-shakeable icons |

### API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/orders` | GET/POST | list / create order |
| `/api/orders/[id]` | GET/PUT | detail / status+rider+payment updates |
| `/api/products` | GET/POST | list / create product |
| `/api/products/[id]` | PUT | update product |
| `/api/stock` | GET/POST | movements / adjust stock |
| `/api/riders` | GET/POST | list / create rider |
| `/api/riders/[id]` | PUT | update rider status |
| `/api/customers` | GET/POST | list / create customer |
| `/api/customers/[id]` | PUT | update customer |
| `/api/dashboard` | GET | KPI aggregate |
| `/api/settings` | GET/PUT | brand & delivery settings |

Caching: `globalThis.__mdDbCache` survives Turbopack hot reloads; writes are debounced (200 ms) so API stays fast after first load. All state persists to a single `data/db.json`.

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Data loss (single JSON file) | High | Nightly copy of `db.json`; v1.1 backup UI |
| Concurrent writes | Low (single team) | Simple server-side mutations; single cache instance |
| Stale market prices → margin erosion | Medium | Stock page shows market vs sell; weekly review |
| Rider workload imbalance | Medium | Riders page shows active load count per rider |
| Cancelled COD → stock confusion | Medium | Auto stock restore on cancel (implemented) |
| Invoice mistakes (price/qty) | Medium | Item-level unit price captured at creation; review before status advance |

---

## 8. Success Metrics

| Metric | Target (first 90 days) |
|---|---|
| Orders/day | 20+ |
| % orders delivered same-day | 80%+ |
| Rider uptime (assigned on time) | 95% |
| Stock accuracy (count vs system) | ±5% |
| Wastage (% of stock) | <5% |
| Invoice printing errors | 0 |
| COD collection vs `paid` reconciled | 100% daily |

---

## 9. Roadmap

### v1.0 (this release — shipped)
Operations console: dashboard, orders + invoice, rider assignment, stock management, customers, riders, settings.

### v1.1 (next)
- WhatsApp order capture (parse order text → order)
- Reports page (sales by cut, wastage, rider performance)
- Daily COD reconciliation view
- Delivery zones & rider GPS
- B2B bulk ordering workflow
- Backup/restore UI

### v1.2+
- Auth & roles (owner / ops / rider app)
- Telegram/WhatsApp notification on new order
- Integration with the public ordering website's API
- Accounting export (CSV)

---

## 10. Decision Log

- **Aug 2026:** Chose JSON file store over a database to keep the first release zero-dependency, instantly deployable, and fully readable/editable by the owner — matching the portability pattern proven in the FlashTrend Studio tool.
- **Aug 2026:** Kept `paid`/`due` on the order object (no payment gateway) so COD operations stay accurate and auditable from day one.
- **Aug 2026:** Seed prices set from real 2026 Dhaka market data so the brand can start quoting credible, margin-protected prices immediately.

---

## End of project plan.