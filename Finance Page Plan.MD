# Finance Page Plan

## Goal

Add a Finance page that gives a clear, real-time view of revenue, profit, outstanding payments, and operating expenses for the Bazarey meat delivery business.

---

## Why a Finance Page Makes Sense

You're right that as the business continues, a dedicated financial view becomes essential. The current app tracks **operational** data very well (orders, riders, stock, POs) but **financial signals are scattered**:

| What you need to know | Where it lives today |
|---|---|
| Revenue today / this month | Dashboard cards (basic) |
| Outstanding customer payments | Spread across Orders page filter |
| Supplier costs (COGS) | Purchase Orders page (no aggregation) |
| Rider payouts | Riders page (per-rider only) |
| Profit margin per order | Not computed anywhere |
| Daily/weekly cash trend | No chart |
| Expense categories (rent, utilities, marketing, salary) | **Not tracked at all** |

A Finance page consolidates all of this and answers the four questions every small business owner asks daily: *How much did I make? What's still owed to me? What did I spend? How much profit is left?*

---

## What the Finance Page Should Contain

### Section 1 — Period Selector (top bar)

- Today / Yesterday / This Week / Last Week / This Month / Last Month / Custom range
- Same date-range pattern used by the rest of the system

### Section 2 — Key Numbers (4 stat cards)

1. **Revenue** — total of `delivered` orders in selected period
2. **Collected** — sum of `paid` on delivered orders (what actually hit the bank/cash)
3. **Outstanding (Receivables)** — sum of `(total - paid)` for non-cancelled orders
4. **COGS** — supplier costs for orders delivered in the period (computed as `sum(item.qty × product.costPrice)`)
5. **Net Profit** — Revenue − COGS − Rider Payouts − Expenses (calculated, not stored)

### Section 3 — Revenue by Payment Method (breakdown card)

- COD, bKash, Nagad, Card, Advance — split as bars or pie
- Shows cash vs digital split — useful for Bangladesh market

### Section 4 — Daily Revenue Trend (simple chart)

- Last 14 or 30 days, one bar per day
- Use **plain inline SVG** (no chart library — keeps bundle small, already consistent with the rest of the app)
- X-axis: dates, Y-axis: ৳ amount

### Section 5 — Top Customers (table)

- Top 10 customers by revenue in period
- Already partially computed on Customers page, but Finance shows it filtered by date range

### Section 6 — Outstanding Receivables (table)

- All non-cancelled orders where `total > paid`
- Sort by oldest first / by amount
- Quick "Mark paid" action (calls existing API to update `paid`)

### Section 7 — Expenses (NEW entity — manual entry)

- New `Expense` table (id, date, category, amount, note, createdAt)
- CRUD modal directly on the Finance page (no separate route)
- Categories: Operating, Marketing, Salary, Other (can be expanded later)

### Section 8 — Export

- Reuse existing `<ExportMenu />` for XLSX + PDF on this page

---

## Architecture Overview

```
Header nav (new item)
  └── /finance
        ├── Period selector (Today / 7d / 30d / Month / Custom)
        ├── 4 stat cards: Revenue, Collected, Receivables, Net Profit
        ├── Revenue-by-payment-method breakdown card
        ├── 14-day revenue trend (inline SVG bar chart)
        ├── Top customers table (top 10 by revenue)
        ├── Outstanding receivables table (with inline Mark-paid)
        ├── Recent expenses table (with Add Expense modal)
        └── Export menu (XLSX / PDF)
```

---

## Files to Add (5 new)

1. **`src/app/finance/page.tsx`** — Main Finance page (client component)
2. **`src/app/finance/expense-modal.tsx`** — Add/edit expense modal
3. **`src/app/api/finance/route.ts`** — GET aggregate stats (period-filtered)
4. **`src/app/api/expenses/route.ts`** — GET (list), POST (create)
5. **`src/app/api/expenses/[id]/route.ts`** — PUT (update), DELETE (remove)

## Files to Modify (5 existing)

1. **`src/lib/types.ts`** — Add `Expense` interface + `ExpenseCategory` enum
2. **`src/lib/db.ts`** — Add `expenses: Record<number, Expense>` to root data + CRUD functions + backfill on load + `getFinanceStats(period)`
3. **`src/lib/ui.tsx`** — Add `EXPENSE_CATEGORIES` constant (using simple generic buckets: Operating, Marketing, Salary, Other)
4. **`src/components/header.tsx`** — Add Finance nav item with `Banknote` icon
5. **`src/lib/db.ts`** `DEFAULT_DATA` — Add empty `expenses: {}` so load doesn't crash

---

## Data Model

```ts
interface Expense {
  id: number;
  date: string;       // YYYY-MM-DD
  category: string;   // "operating" | "marketing" | "salary" | "other" | user-defined
  amount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}
```

Stored at `db.json.expenses: Record<number, Expense>`.

---

## Period Filter Logic

- `Today` — orders/POs where `deliveredAt` / `receivedDate` is today (BD time)
- `Last 7d / 30d` — rolling window
- `This Month / Last Month` — calendar month
- `Custom` — user picks start/end dates

## COGS Calculation

For each delivered order in the period:

```
cogs = sum(item.qty * product.costPrice)  // costPrice exists per Product
```

Joined via `item.productId → product.costPrice`.

## Net Profit Formula

```
Revenue      = sum(delivered orders' total)
COGS         = sum(item.qty * product.costPrice) for those orders
Rider Payout = sum(order.riderCost) for delivered own-rider orders
Expenses     = sum(expenses in period)
Net Profit   = Revenue − COGS − Rider Payout − Expenses
```

## Receivables Table

- All orders where `status !== "cancelled"` AND `total > paid`
- Columns: Order #, Customer, Phone, Total, Paid, Due, Age (days since confirmed), Actions
- **Inline Mark-paid** button: opens prompt for amount → calls `PUT /api/orders/[id]` with `paid: order.total`
- Sortable by Age (oldest first as default — high-risk debt)

## Trend Chart (inline SVG)

- 14 most recent days
- X-axis: M-D labels every 2 days
- Y-axis: ৳ amounts at min/mid/max
- Bars: green if day had revenue, muted otherwise
- No external chart library — pure SVG, ~80 lines

---

## Behavior Matrix

| Section | New logic | Data source |
|---|---|---|
| Revenue | Sum delivered `total` | Orders |
| Collected | Sum delivered `paid` | Orders |
| Receivables | Sum `total - paid` non-cancelled | Orders |
| COGS | Sum `qty × costPrice` delivered items | Orders + Products |
| Rider Payout | Sum `riderCost` delivered own-rider | Orders |
| Expenses | Sum `amount` for date range | Expenses (new) |
| Net Profit | Computed | Combined |

---

## Tradeoffs

- **Inline chart vs library**: Inline SVG keeps bundle small and matches the rest of the app's no-deps approach. Slightly more code than `recharts` but zero risk of version conflict with Next 16.
- **Receivables inline edit**: Calling PUT on each click is simple and reuses the existing API. No need for a new bulk-receive endpoint.
- **COGS accuracy**: Uses current `costPrice`, not historical. If you raise prices mid-period, prior COGS is overestimated. PO-based matching is more accurate but doubles complexity. Going with `costPrice` per chosen option.

---

## Verification

1. `npm run lint` — pass.
2. `npm run build` — pass.
3. Add a few test expenses via API or modal (e.g., ৳5000 rent, ৳1200 utilities).
4. Open `/finance`, verify all 4 stat cards compute correctly.
5. Add an outstanding payment scenario (create order with `paid < total`), confirm it appears in Receivables table.
6. Click Mark-paid inline → confirm `paid` updates via API.
7. Open Export menu → confirm XLSX + PDF download.
8. Refresh after navigation — confirm Finance nav item stays highlighted correctly.

---

## Risk

- **Low.** Pure additive — new page, new entity, no schema migrations on existing data (existing orders/POs/riders unchanged).
- The `db.json` schema gains a new `expenses: {}` key. Existing loads will backfill this on first read (already happens for missing keys).

---

## Open Items to Decide Later

- Custom expense categories (start with 4 generic buckets)
- Whether to add a separate `/expenses` page later for full CRUD
- Whether to add a Cash Flow statement (period-by-period running balance)
- Tax/withholding tracking

---

## Decisions Made

- **Expense tracker**: YES — add manual Expense tracker
- **Categories**: Start with 4 generic buckets (Operating, Marketing, Salary, Other), expand later
- **COGS**: Per-product `costPrice × quantity` (recommended)
- **Receivables**: YES — show with inline mark-paid
- **Nav placement**: Add to main nav with `Banknote` icon
- **Expense form**: Modal on Finance page (no separate route)
