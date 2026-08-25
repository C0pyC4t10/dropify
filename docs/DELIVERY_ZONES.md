# Bazarey Meat Delivery — Dhaka Delivery Grid (Operational Study)

**Project:** Bazarey Meat Delivery operations console
**Hub:** Aftabnagar, Dhaka
**Scope:** Dhaka Metro (DNCC + DSCC + peri-urban fringe)
**Owner:** Bazarey Ltd / Skarbol Tech
**Version:** 1.0 (this study) — implemented in code at `src/lib/locations.ts`
**Last updated:** Aug 2026

---

## 1. Why this study exists

The Dhaka-metro delivery operation has outgrown the simple "DNCC / DSCC" administrative split. Government boundaries are useful for civic administration but they don't reflect:

- **Where the rider's first turn out of the warehouse is** — our hub is in **Aftabnagar**, which sits on the boundary between DNCC Ward 31 and DSCC Ward 22, but operationally belongs to the eastern radial (Badda / Rampura / Gulshan) axis, not the central one.
- **Where Dhaka's traffic actually flows** — major corridors are north-south (Mirpur Road, Begum Rokeya Sarani, Airport Road, Pragati Sarani, Dhaka–Chittagong Road, Dhaka–Narayanganj Road, Mawa Road) with comparatively weaker east-west connectivity.
- **How dispatchers actually think at 8 AM** — they say "give me the Badda rider", not "give me a DNCC rider".
- **How the planned MRT Line 1 will reshape travel** — its corridor (Airport → Kuril → Badda → Rampura → Malibagh → Razarbagh → Kamalapur) is exactly the eastern delivery axis, so our grid should map to it.

The right primitive is **road-corridor + cluster + sub-cluster**, not ward number.

---

## 2. The Bazarey Dhaka Delivery Grid — 4 clusters

Four radial delivery territories around the **Aftabnagar hub**.

```
                         NORTH
                           ↑
              ┌─────────────────────┐
              │                     │
              │   DHK-NW            │
              │   North / NW        │
              │                     │
              │ Mirpur              │
              │ Agargaon            │
              │ Mohammadpur         │
              │ Tejgaon             │
              │ Cantonment / Banani │
              └──────────┬──────────┘
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
       │ DHK-CW          │  AFTABNAGAR      │ DHK-E
       │ Central / West  │     HUB          │ East / NE
       │                 │                 │
       │ Dhanmondi       │                 │ Badda
       │ Shahbagh        │                 │ Gulshan
       │ New Market      │                 │ Banani
       │ Old Dhaka       │                 │ Bashundhara
       │ Wari            │                 │ Uttara
       └─────────────────┼─────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              │   DHK-SE            │
              │   South / SE        │
              │                     │
              │ Khilgaon            │
              │ Motijheel           │
              │ Jatrabari           │
              │ Demra               │
              └─────────────────────┘
                           ↓
                         SOUTH
```

| Code | Name | Direction from Hub | # Areas | Color |
|------|------|--------------------|--------:|-------|
| **DHK-E** | East & Northeast | Aftabnagar → Rampura → Badda → Gulshan → Banani → Bashundhara → Uttara | 91 | 🟢 Green |
| **DHK-NW** | North & Northwest | Aftabnagar → Moghbazar → Tejgaon → Farmgate → Agargaon → Mirpur → Mohammadpur | 54 | 🟢 Emerald |
| **DHK-CW** | Central & West | Aftabnagar → Moghbazar → Shahbagh → Dhanmondi → Old Dhaka | 77 | 🟡 Amber |
| **DHK-SE** | South & Southeast | Aftabnagar → Khilgaon → Malibagh → Motijheel → Paltan → Jatrabari → Demra | 36 | 🔴 Red |

**Total: 258 Dhaka-metro areas** — every entry in the curated centroid table is assigned to exactly one cluster.

### Aftabnagar is the HUB, not a cluster

The hub sits on the western edge of DHK-E. Every rider starts and ends their shift at Aftabnagar. Aftabnagar itself resolves to **DHK-E / E1** by default but is operationally treated as the dispatch origin — not a delivery destination.

---

## 3. The 4 corridors

Each cluster has a single dominant road corridor. Riders should follow the corridor, not zig-zag across the city.

### E-Corridor (Eastern arterial)
**Spine:** Aftabnagar → Rampura → Badda → Pragati Sarani → Natun Bazar → Kuril → Bashundhara → Kuratoli → Khilkhet → Airport → Uttara

This is the **Pragati Sarani / Rampura-Badda corridor** — the spine of DHK-E. Pragati Sarani is the major north-south arterial that links Badda, Natun Bazar, Kuril, and onward to the Airport.

### N-Corridor (Northern arterial)
**Spine:** Aftabnagar → Moghbazar → Tejgaon → Farmgate → Agargaon → Mirpur Road → Mirpur → Pallabi → Kafrul

This is the **Mirpur Road / Begum Rokeya Sarani corridor** — Dhaka's principal north-south road. Riders on this corridor should keep going north; they should never dip south into Dhanmondi or Old Dhaka mid-shift.

### W-Corridor (Central-West arterial)
**Spine:** Aftabnagar → Moghbazar → Shahbagh → Dhanmondi → Kalabagan → Mohammadpur → Shyamoli

This is the **Moghbazar-Dhanmondi-New Market** axis. It's dense, slow, and parking-hostile — a single rider per sub-cluster works best.

### S-Corridor (Southern arterial)
**Spine:** Aftabnagar → Banasree → Khilgaon → Malibagh → Motijheel → Paltan → Jatrabari → Demra

This is the **Malibagh-Motijheel-Jatrabari** axis. Aftabnagar is geographically well-positioned for this corridor — strong advantage.

---

## 4. Sub-clusters (the actual rider routes)

Each cluster is subdivided into 6–9 sub-clusters. Each sub-cluster = one rider route. If volume exceeds one rider per sub-cluster, split the sub-cluster further — never combine two sub-clusters on one rider.

### DHK-E — East & Northeast

| Sub | Label | Approx. corridor | When to dispatch |
|-----|-------|------------------|------------------|
| **E1** | Rampura + Banasree | Aftabnagar → Rampura → Banasree | Afternoon |
| **E2** | Badda + Merul + Shahjadpur | Pragati Sarani spine | Afternoon |
| **E3** | Gulshan + Banani + Baridhara | Aftabnagar → Gulshan-1 → Banani → Baridhara | Morning |
| **E4** | Notun Bazar + Bashundhara | Bashundhara R/A + 300-ft area | Morning |
| **E5** | Khilkhet + Kuril + Nikunja | Pragati Sarani → Airport Rd | Morning |
| **E6** | Airport + Uttara (satellite) | Airport Rd / Abdullahpur corridor | Morning |

> **E6 is a satellite.** When volume grows enough, split Uttara off into its own route — the Airport / Abdullahpur corridor is sufficiently long and operationally distinct from Bashundhara/Gulshan. The DNCC itself separates Uttara and the Kuril/Khilkhet side into different wards.

### DHK-NW — North & Northwest

| Sub | Label | Approx. corridor |
|-----|-------|------------------|
| **NW1** | Tejgaon + Farmgate + Karwan Bazar | Aftabnagar → Moghbazar → Tejgaon → Farmgate |
| **NW2** | Agargaon + Sher-e-Bangla Nagar | Agargaon → Ibrahimpur |
| **NW3** | Mirpur 1–2 + Darus Salam | Mirpur Road south end |
| **NW4** | Mirpur 3–10 | Mirpur Road middle |
| **NW5** | Mirpur 11–14 + Pallabi + DOHS | Mirpur Road north + Cantonment |
| **NW6** | Kazipara + Shewrapara + Kafrul | Begum Rokeya Sarani |
| **NW7** | Mohammadpur + Shyamoli + Adabor (+ Banani / Cantonment) | Mohammadpur / Ring Road |
| **NW8** | Bosila + Rayer Bazar + Savar fringe | Western edge / Savar highway |

> **Cantonment + Banani are in NW7** (not E3) operationally — they cluster with Mohammadpur for routing purposes because the road path from Aftabnagar → Banani → Cantonment → Mirpur DOHS is shorter than going east first.

### DHK-CW — Central & West

| Sub | Label | Notes |
|-----|-------|-------|
| **CW1** | Moghbazar + Ramna + Eskaton + Hatirpool | The institutional spine |
| **CW2** | Dhanmondi + Kalabagan + Green Road | Dhanmondi 1–19 + satellites |
| **CW3** | New Market + Nilkhet + Azimpur | The DU / Nilkhet bookshop belt |
| **CW4** | Lalbagh + Chawkbazar + Old Dhaka core | Old Dhaka's high-density market |
| **CW5** | Bangshal + Sutrapur + Kotwali + Islampur | The wholesale belt |
| **CW6** | Kamrangirchar + Keraniganj | River crossing — confirm feasibility per order |
| **CW7** | Wari + Gandaria + Narinda | Old Dhaka east |

> **High traffic risk.** Central Dhaka has dense buildings, narrow roads, parking difficulty, school/office congestion, and many one-way roads. One rider per sub-cluster is the cap.

### DHK-SE — South & Southeast

| Sub | Label | Approx. corridor |
|-----|-------|------------------|
| **SE1** | Khilgaon + Goran | Aftabnagar → Khilgaon → Goran |
| **SE2** | Bashabo + Sabujbagh + Madartek | Bashabo / Maniknagar |
| **SE3** | Malibagh + Shantinagar + Fakirapool | Malibagh Chowdhurypara |
| **SE4** | Motijheel + Paltan + Kakrail + Kamalapur | Motijheel commercial district |
| **SE5** | Mugda + Maniknagar | Eastern inner ring |
| **SE6** | Jatrabari + Dhalpur + Donia | Dhaka–Chittagong highway start |
| **SE7** | Shyampur + Kadamtali + Postogola | Buriganga-side industrial |
| **SE8** | Matuail + Demra + Sarulia | Industrial belt — confirm access |

---

## 5. Operational rules

### Rule 1 — One rider = one cluster per shift

```
WRONG:
  Aftabnagar → Uttara → Jatrabari → Dhanmondi → Bashundhara

RIGHT:
  Rider A → DHK-E   (Badda → Gulshan → Banani)
  Rider B → DHK-SE  (Khilgaon → Motijheel → Jatrabari)
  Rider C → DHK-CW  (Dhanmondi → Shahbagh → Old Dhaka)
  Rider D → DHK-NW  (Tejgaon → Mirpur)
```

### Rule 2 — Don't cross cluster boundaries unless order volume justifies it

A rider can take Gulshan + Badda + Bashundhara orders (all DHK-E).
A rider should NOT take Gulshan + Dhanmondi + Jatrabari orders in one shift.

### Rule 3 — Use the corridor, not the crow-fly distance

The optimizer in the route planner (`src/lib/geo.ts`) uses haversine as a fallback but **OSRM** (real road network) when available. Always run the route through the corridor, even if the straight-line distance is shorter through another cluster.

### Rule 4 — Traffic windows

| Window | Time | Best for | Why |
|--------|------|----------|-----|
| **Morning** | 7–11 AM | Uttara, Mirpur, Gulshan, Banani, Bashundhara | Riders can reach before office congestion |
| **Midday** | 11 AM – 4 PM | Dhanmondi, Shahbagh, New Market, Central | Office-district traffic has settled |
| **Afternoon** | 4 – 7 PM | Badda, Rampura, Banasree, Khilgaon | Aftabnagar-adjacent — quick turnaround |
| **Evening** | 7 – 10 PM | **Avoid new dispatch** — only complete existing plans | Dhaka's worst congestion window |

### Rule 5 — Cluster-backed auto-assign

When the dispatcher clicks "Auto-assign by cluster" on `/routes`:
1. All unassigned orders for the date are bucketed by their cluster.
2. For each cluster, the server finds active riders whose `homeCluster` (or `subClusters`) match.
3. Riders receive orders round-robin within their cluster, weighted by `maxStops` cap.
4. Riders with no matching cluster are skipped (their assigned clusters get no auto-assigned orders but their existing plans are untouched).
5. **`riderSeq` is NOT set** — the sequence is set by the route planner UI after the dispatcher reviews.

---

## 6. Rider allocation model

### Starting allocation (8 riders)

| Cluster | Riders | Primary routes |
|---------|-------:|----------------|
| DHK-E | 2 | E2 / E4 (Badda, Bashundhara) |
| DHK-NW | 2 | NW4 / NW5 (Mirpur middle + Pallabi) |
| DHK-CW | 2 | CW2 (Dhanmondi) + CW5 (Old Dhaka) |
| DHK-SE | 2 | SE4 / SE6 (Motijheel, Jatrabari) |

### Volume-based reallocation

If the daily split looks like **E = 30, NW = 15, CW = 20, SE = 35**:
- E → 3 riders
- NW → 1 rider (+ overflow to NW-adjacent cluster)
- CW → 2 riders
- SE → 3 riders
- 1 floating / backup rider

### How riders express their cluster

Each rider row has:
- `homeCluster` — primary cluster, always preferred for auto-assign.
- `subClusters` — secondary clusters they'll accept when home is quiet.
- `maxStops` — soft cap on stops per shift (round-robin respects this).

```ts
// Example: Mehedi covers DHK-E primarily, can take DHK-SE overflow,
//          capped at 25 stops/shift
{
  name: "Mehedi Hasan",
  homeCluster: "DHK-E",
  subClusters: ["DHK-SE"],
  maxStops: 25,
}
```

---

## 7. Implementation map

Every rule above is wired into the app:

| Concern | Where in code |
|---------|---------------|
| Master cluster + sub-cluster map (258 areas) | `src/lib/locations.ts` — `LOCATIONS` |
| Cluster fallback heuristic (centroid quadrant → cluster) | `src/lib/locations.ts` — `getLocationForArea` |
| Cluster badge labels (UI) | `src/lib/ui.tsx` — `CLUSTER_LABELS`, `CLUSTER_COLORS`, `SUB_CLUSTER_LABELS` |
| `Order.cluster` + `Order.subCluster` (DB columns) | `src/lib/db.ts` — schema + `createOrder` + `updateOrder` |
| `Rider.homeCluster` + `subClusters` + `maxStops` (DB columns) | `src/lib/db.ts` — schema + `createRider`/`updateRider` |
| Auto-backfill cluster for legacy orders on first boot | `src/lib/db.ts` — `initSchema` migration |
| Auto-detected cluster chip on order form (live) | `src/components/order-form.tsx` |
| Rider admin: pick homeCluster + subClusters + maxStops | `src/app/riders/page.tsx` — `AddRiderModal`/`EditRiderModal` |
| Orders list: cluster filter + cluster column | `src/app/orders/page.tsx` |
| `/routes` page: bucket unassigned by cluster + Auto-assign button | `src/app/routes/page.tsx` |
| Auto-assign API endpoint (server-side round-robin) | `src/app/api/routes/auto-assign/route.ts` → `autoAssignOrdersByCluster` |
| Driver of cluster resolve from area | `src/lib/db.ts` — `createOrder` calls `getLocationForArea` |

---

## 8. Scaling plan — when volume grows

The 4-cluster model is the **correct starting architecture**. It is designed to expand without schema changes.

### Phase 2 (when daily orders > 50)

- **Split E6 (Uttara)** off DHK-E as its own satellite route: `E7 — Uttara (satellite)`. Airport road is long enough that a dedicated rider makes sense.
- **Split NW** into two macro-clusters: `DHK-NW1` (Mirpur) and `DHK-NW2` (Tejgaon + Mohammadpur). Mirpur alone has 18+ sub-areas and will easily justify its own rider team.
- **Add CW8** for Hazaribagh + Rayer Bazar if those orders spike.

### Phase 3 (when daily orders > 150)

- 8–12 macro-routes, each with its own rider team.
- Per-cluster dashboards on the home page (today's orders by cluster, today's delivered by cluster, etc.).
- Per-cluster rider performance reports.

### Phase 4 (when daily orders > 500)

- Real-time rider GPS tracking via rider mobile app.
- Per-sub-cluster live ETAs.
- Auto-dispatch based on order time-of-day and the dispatch windows above.

---

## 9. Aftabnagar — hub advantage summary

Aftabnagar is **geographically ideal** for this 4-cluster system:

- **East** (Badda → Gulshan → Banani → Bashundhara → Uttara) — strongest advantage; the cluster is essentially the hub's home territory.
- **South** (Khilgaon → Motijheel → Jatrabari → Demra) — strong advantage via Malibagh corridor.
- **Central** (Moghbazar → Shahbagh → Dhanmondi → Old Dhaka) — neutral via Moghbazar; reasonable reach.
- **North** (Tejgaon → Farmgate → Mirpur → Mohammadpur → Uttara) — moderate advantage; Mirpur is the longest single-haul but well-served by the Mirpur Road corridor.

The planned MRT Line 1 corridor (Airport → Kuril → Badda → Rampura → Malibagh → Razarbagh → Kamalapur) passes through the heart of DHK-E and the start of DHK-SE. Once operational, our grid will track the line almost 1:1.

---

## 10. What this document is NOT

- **Not a public website map** — the leaflet map at `/routes` still uses the existing Pin clusters. Visual overlay of the 4-cluster grid is a v1.1 item.
- **Not a substitute for dispatch judgement** — auto-assign respects rider caps and cluster membership, but the dispatcher always reviews the result on `/routes/[riderId]` before saving.
- **Not fixed for all time** — sub-cluster boundaries are operational choices. The master file `src/lib/locations.ts` is the source of truth; change an entry and re-seed the next time the server boots.

---

## 11. Quick reference for dispatchers

> **Before the shift:**
> - Open `/routes` for today's date.
> - Confirm each rider has `homeCluster` set on `/riders`.
>
> **When orders arrive:**
> - Manual: order form auto-detects cluster from the chosen area (look for the colored chip).
> - Bulk: `/routes` → **Auto-assign by cluster** button.
>
> **During the shift:**
> - Open the rider's plan at `/routes/[riderId]` and click **Optimize**.
> - The optimizer stays inside the rider's cluster corridors by design (NN + 2-opt over haversine / OSRM).
>
> **End of shift:**
> - Delivered orders auto-clear the rider's active load.
> - Low-stock items (if any) get flagged on the dashboard.

---

*Last reviewed: Aug 2026 · Bazarey Ltd / Skarbol Tech*
