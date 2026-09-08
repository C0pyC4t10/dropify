/**
 * Dropify Dhaka Delivery Grid — operational cluster map.
 *
 * Why this file exists
 * ─────────────────────
 * Dhaka's DNCC/DSCC administrative zones are useful for government work but
 * NOT optimal for delivery routing. Road structure (north-south corridors
 * like Mirpur Road, Begum Rokeya Sarani, Airport Road, Pragati Sarani, plus
 * the east-west Moghbazar–Jatrabari–Demra axis) is what actually decides
 * where a rider should go on any given shift.
 *
 * We model Dhaka as four radial delivery territories around the Aftabnagar
 * hub, each with 6–9 sub-clusters that map to a single rider route.
 *
 *  ┌────────────────────────────────────────────────────────────┐
 *  │                                                            │
 *  │   CLUSTER 02 — DHK-NW (North / NW)                        │
 *  │   Tejgaon → Farmgate → Agargaon → Mirpur → Mohammadpur    │
 *  │                                                            │
 *  │   CLUSTER 01 — DHK-E  (East / NE)                         │
 *  │   Aftabnagar → Rampura → Badda → Gulshan → Banani         │
 *  │   → Bashundhara → Kuril → Khilkhet → Uttara               │
 *  │                                                            │
 *  │   CLUSTER 03 — DHK-CW (Central / West)                    │
 *  │   Moghbazar → Shahbagh → Dhanmondi → Old Dhaka            │
 *  │                                                            │
 *  │   CLUSTER 04 — DHK-SE (South / SE)                        │
 *  │   Khilgaon → Motijheel → Jatrabari → Demra                │
 *  │                                                            │
 *  └────────────────────────────────────────────────────────────┘
 *
 * Aftabnagar is the HUB — not a delivery cluster. Every rider starts the
 * shift there and returns there.
 *
 * This file is the single source of truth. To add a new area, add an entry
 * to `LOCATIONS`. The rest of the app (db.ts, order form, orders list,
 * /routes, /locations) reads from here.
 */

import { DHAKA_CENTROIDS_RAW, DEFAULT_CENTROID, getAreaCentroid, type AreaCentroid } from "./area-centroids";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 4-cluster delivery grid centered on Aftabnagar. */
export type Cluster = "DHK-E" | "DHK-NW" | "DHK-CW" | "DHK-SE";

/** Sub-cluster identifier — letter prefix = cluster, number = route within it. */
export type SubCluster =
  | "E1" | "E2" | "E3" | "E4" | "E5" | "E6"
  | "NW1" | "NW2" | "NW3" | "NW4" | "NW5" | "NW6" | "NW7" | "NW8"
  | "CW1" | "CW2" | "CW3" | "CW4" | "CW5" | "CW6" | "CW7"
  | "SE1" | "SE2" | "SE3" | "SE4" | "SE5" | "SE6" | "SE7" | "SE8";

/** Major road corridor — the spine the rider follows. */
export type Corridor = "E-Corridor" | "N-Corridor" | "W-Corridor" | "S-Corridor" | "Hub-Adjacent";

/** Preferred time-of-day window to dispatch orders in this area. */
export type DispatchWindow = "morning" | "midday" | "afternoon" | "evening";

/** A single area's full operational assignment. */
export interface AreaLocation {
  cluster: Cluster;
  subCluster: SubCluster;
  corridor: Corridor;
  window: DispatchWindow;
  /** Short human label (English) for the sub-cluster. Shown in rider UI + invoice footer. */
  subClusterLabel: string;
  /** Short operational note (free text). Why this sub-cluster is grouped this way. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Cluster / sub-cluster / corridor metadata
// ---------------------------------------------------------------------------

export const CLUSTER_META: Record<Cluster, {
  name: string;
  code: Cluster;
  color: string;
  direction: string;
  description: string;
  subClusters: SubCluster[];
}> = {
  "DHK-E": {
    name: "East & Northeast",
    code: "DHK-E",
    color: "var(--color-success)",
    direction: "Aftabnagar → Rampura → Badda → Gulshan → Banani → Bashundhara → Uttara",
    description: "The eastern and northeastern corridor of Dhaka. The hub is on the western edge of this cluster.",
    subClusters: ["E1", "E2", "E3", "E4", "E5", "E6"],
  },
  "DHK-NW": {
    name: "North & Northwest",
    code: "DHK-NW",
    color: "#10b981",
    direction: "Aftabnagar → Moghbazar → Tejgaon → Farmgate → Agargaon → Mirpur → Mohammadpur",
    description: "Largest geographic cluster. Tajgaon industrial belt + Mirpur DOHS + Mohammadpur.",
    subClusters: ["NW1", "NW2", "NW3", "NW4", "NW5", "NW6", "NW7", "NW8"],
  },
  "DHK-CW": {
    name: "Central & West",
    code: "DHK-CW",
    color: "#eab308",
    direction: "Aftabnagar → Moghbazar → Shahbagh → Dhanmondi → Old Dhaka",
    description: "Dense urban core. High delivery potential but tight roads, parking difficulty.",
    subClusters: ["CW1", "CW2", "CW3", "CW4", "CW5", "CW6", "CW7"],
  },
  "DHK-SE": {
    name: "South & Southeast",
    code: "DHK-SE",
    color: "#ef4444",
    direction: "Aftabnagar → Khilgaon → Malibagh → Motijheel → Paltan → Jatrabari → Demra",
    description: "Southern & southeastern Dhaka. Aftabnagar has a strong geographic advantage here.",
    subClusters: ["SE1", "SE2", "SE3", "SE4", "SE5", "SE6", "SE7", "SE8"],
  },
};

export const SUB_CLUSTER_META: Record<SubCluster, { label: string; note?: string }> = {
  // East
  E1: { label: "Rampura + Banasree", note: "Aftabnagar → Rampura → Banasree" },
  E2: { label: "Badda + Merul + Shahjadpur", note: "Pragati Sarani spine" },
  E3: { label: "Gulshan + Banani + Baridhara", note: "Premium corridor, morning dispatch preferred" },
  E4: { label: "Notun Bazar + Bashundhara", note: "Bashundhara R/A + 300-ft area" },
  E5: { label: "Khilkhet + Kuril + Nikunja" },
  E6: { label: "Airport + Uttara (satellite)", note: "Long-haul; consider separate route when volume grows" },

  // North / NW
  NW1: { label: "Tejgaon + Farmgate + Karwan Bazar" },
  NW2: { label: "Agargaon + Sher-e-Bangla Nagar" },
  NW3: { label: "Mirpur 1–2 + Darus Salam" },
  NW4: { label: "Mirpur 6–10" },
  NW5: { label: "Mirpur 11–14 + Pallabi + DOHS" },
  NW6: { label: "Kazipara + Shewrapara + Kafrul" },
  NW7: { label: "Mohammadpur + Shyamoli + Adabor" },
  NW8: { label: "Bosila + Rayer Bazar + Savar fringe" },

  // Central / West
  CW1: { label: "Moghbazar + Ramna + Eskaton + Hatirpool" },
  CW2: { label: "Dhanmondi + Kalabagan + Green Road" },
  CW3: { label: "New Market + Nilkhet + Azimpur" },
  CW4: { label: "Lalbagh + Chawkbazar + Old Dhaka core" },
  CW5: { label: "Bangshal + Sutrapur + Kotwali + Islampur" },
  CW6: { label: "Kamrangirchar + Keraniganj" },
  CW7: { label: "Wari + Gandaria + Narinda" },

  // South / SE
  SE1: { label: "Khilgaon + Goran" },
  SE2: { label: "Bashabo + Sabujbagh + Madartek" },
  SE3: { label: "Malibagh + Shantinagar + Fakirapool" },
  SE4: { label: "Motijheel + Paltan + Kakrail + Kamalapur" },
  SE5: { label: "Mugda + Maniknagar" },
  SE6: { label: "Jatrabari + Dhalpur + Donia" },
  SE7: { label: "Shyampur + Kadamtali + Postogola" },
  SE8: { label: "Matuail + Demra + Sarulia" },
};

// ---------------------------------------------------------------------------
// Area → location assignment (the master table)
// ---------------------------------------------------------------------------

const LOCATIONS: Record<string, AreaLocation> = {
  // ────────── DHK-E (East / Northeast) ──────────
  // E1 — Rampura + Banasree
  "Rampura":                 { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Rampura TV Center":       { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "East Rampura":            { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Sipahi Bagicha":          { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label, note: "East Rampura border area" },
  "Banasree":                { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Banasree Block A":        { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Banasree Block B":        { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Banasree Block C":        { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Banasree Block D":        { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Banasree Block E":        { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Banasree Block F":        { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Bonosree":                { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "South Bonosree":          { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },
  "Manda":                   { cluster: "DHK-E", subCluster: "E1", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E1.label },

  // E2 — Badda + Merul + Shahjadpur
  "Badda":                   { cluster: "DHK-E", subCluster: "E2", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label },
  "Badda (Gulshan)":         { cluster: "DHK-E", subCluster: "E2", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label, note: "Western Badda near Gulshan border" },
  "Badda Link Road":         { cluster: "DHK-E", subCluster: "E2", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label },
  "Merul Badda":             { cluster: "DHK-E", subCluster: "E2", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label },
  "North Badda":             { cluster: "DHK-E", subCluster: "E2", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label },
  "Middle Badda":            { cluster: "DHK-E", subCluster: "E2", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label },
  "South Badda":             { cluster: "DHK-E", subCluster: "E2", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label },
  "Solmaid":                 { cluster: "DHK-E", subCluster: "E2", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label },
  "Notun Bazar":             { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Joar Sahara":             { cluster: "DHK-E", subCluster: "E2", corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label, note: "Badda–Aftabnagar corridor" },

  // Aftabnagar (HUB — NOT a sub-cluster. Cluster still resolved for orders)
  "Aftabnagar":              { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub", note: "Warehouse / dispatch origin" },
  "Aftabnagar East":         { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar West":         { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar Sector 1":     { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar Sector 2":     { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar Sector 3":     { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar Sector 4":     { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar Sector 5":     { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar M Block":      { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar N Block":      { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar B Block":      { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar C Block":      { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar D Block":      { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar E Block":      { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },
  "Aftabnagar F Block":      { cluster: "DHK-E", subCluster: "E1", corridor: "Hub-Adjacent", window: "afternoon", subClusterLabel: "Hub" },

  // E3 — Gulshan + Banani + Baridhara
  "Gulshan":                 { cluster: "DHK-E", subCluster: "E3", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E3.label },
  "Gulshan 1":               { cluster: "DHK-E", subCluster: "E3", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E3.label },
  "Gulshan 2":               { cluster: "DHK-E", subCluster: "E3", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E3.label },
  "Gulshan Circle 1":        { cluster: "DHK-E", subCluster: "E3", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E3.label },
  "Gulshan Circle 2":        { cluster: "DHK-E", subCluster: "E3", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E3.label },
  "Baridhara":               { cluster: "DHK-E", subCluster: "E3", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E3.label },
  "Baridhara DOHS":          { cluster: "DHK-E", subCluster: "E3", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E3.label },
  "Niketan":                 { cluster: "DHK-E", subCluster: "E3", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E3.label },

  // E4 — Bashundhara
  "Bashundhara R/A":         { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block A":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block B":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block C":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block D":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block E":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block F":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block G":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block H":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block I":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block J":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block K":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block L":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block M":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Bashundhara Block N":     { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Kuratoli":                { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Dumni":                   { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },
  "Pink City":               { cluster: "DHK-E", subCluster: "E4", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E4.label },

  // E5 — Khilkhet + Kuril + Nikunja
  "Khilkhet":                { cluster: "DHK-E", subCluster: "E5", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E5.label },

  // E6 — Airport + Uttara (satellite)
  "Uttara":                  { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label, note: "Long-haul; consider splitting once volume grows" },
  "Uttara Sector 1":         { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 2":         { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 3":         { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 4":         { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 5":         { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 6":         { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 7":         { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 8":         { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 9":         { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 10":        { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 11":        { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 12":        { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 13":        { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 14":        { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Uttara Sector 15":        { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Azampur":                 { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Diabari":                 { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Kamarpara":               { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Rajlokkhi":               { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Bawlia":                  { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label },
  "Tongi":                   { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label, note: "Beyond core delivery radius — confirm before accepting" },
  "Gazipur":                 { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label, note: "Beyond core delivery radius — confirm before accepting" },
  "Kashimpur":               { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label, note: "Beyond core delivery radius — confirm before accepting" },
  "Konabari":                { cluster: "DHK-E", subCluster: "E6", corridor: "E-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.E6.label, note: "Beyond core delivery radius — confirm before accepting" },

  // ────────── DHK-NW (North / Northwest) ──────────
  // NW1 — Tejgaon + Farmgate + Karwan Bazar
  "Karwan Bazar":            { cluster: "DHK-NW", subCluster: "NW1", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW1.label },
  // NW2 — Agargaon + Sher-e-Bangla Nagar
  "Agargaon":                { cluster: "DHK-NW", subCluster: "NW2", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW2.label },
  "Monipur":                 { cluster: "DHK-NW", subCluster: "NW2", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW2.label },
  "Ibrahimpur":              { cluster: "DHK-NW", subCluster: "NW2", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW2.label },

  // NW3 — Mirpur 1-2 (close)
  "Mirpur":                  { cluster: "DHK-NW", subCluster: "NW3", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW3.label },
  "Mirpur 1":                { cluster: "DHK-NW", subCluster: "NW3", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW3.label },
  "Mirpur 2":                { cluster: "DHK-NW", subCluster: "NW3", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW3.label },

  // NW4 — Mirpur 6-10
  "Mirpur 3":                { cluster: "DHK-NW", subCluster: "NW4", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW4.label },
  "Mirpur 4":                { cluster: "DHK-NW", subCluster: "NW4", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW4.label },
  "Mirpur 5":                { cluster: "DHK-NW", subCluster: "NW4", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW4.label },
  "Mirpur 6":                { cluster: "DHK-NW", subCluster: "NW4", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW4.label },
  "Mirpur 7":                { cluster: "DHK-NW", subCluster: "NW4", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW4.label },
  "Mirpur 8":                { cluster: "DHK-NW", subCluster: "NW4", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW4.label },
  "Mirpur 9":                { cluster: "DHK-NW", subCluster: "NW4", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW4.label },
  "Mirpur 10":               { cluster: "DHK-NW", subCluster: "NW4", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW4.label },

  // NW5 — Mirpur 11-14 + Pallabi + DOHS
  "Mirpur DOHS":             { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Mirpur Cantonment":       { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Mirpur 11":               { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Mirpur 12":               { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Mirpur 13":               { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Mirpur 14":               { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Pallabi":                 { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Rupnagar":                { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Manikdi":                 { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Vashantek":               { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Duaripara":               { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },
  "Senpara":                 { cluster: "DHK-NW", subCluster: "NW5", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW5.label },

  // NW6 — Kazipara + Shewrapara + Kafrul
  "Kazipara":                { cluster: "DHK-NW", subCluster: "NW6", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW6.label },
  "Shewrapara":              { cluster: "DHK-NW", subCluster: "NW6", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW6.label },
  "Kafrul":                  { cluster: "DHK-NW", subCluster: "NW6", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW6.label },
  "Ahmed Nagar":             { cluster: "DHK-NW", subCluster: "NW6", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW6.label },

  // Banani + Cantonment (geographically NW of Aftabnagar, but premium E morning dispatch)
  "Banani":                  { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Banani DOHS":             { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Cantonment":              { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW7.label },

  // NW7 — Mohammadpur + Shyamoli + Adabor
  "Mohammadpur":             { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Shyamoli":                { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Adabor":                  { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Ring Road (Mohammadpur)": { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Lalmatia":                { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Hossain Market":          { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Kallyanpur":              { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Pirerbag":                { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW7.label },
  "Beribadh":                { cluster: "DHK-NW", subCluster: "NW7", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW7.label },

  // NW8 — Bosila + Rayer Bazar + Savar fringe
  "Town Hall":               { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label },
  "Bosila":                  { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label },
  "Mohanagar":               { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label, note: "Between Mohammadpur and Dhanmondi" },
  "Amin Bazar":              { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label, note: "Far edge — confirm before accepting" },
  "Hemayetpur":              { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label, note: "Beyond core delivery radius" },
  "Aga Nagar":               { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label, note: "Beyond core delivery radius" },
  "Savar":                   { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label, note: "Beyond core delivery radius" },
  "Birulia":                 { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label, note: "Beyond core delivery radius" },
  "Dhamrai":                 { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label, note: "Beyond core delivery radius" },
  "Beribadh (West)":         { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label },
  "Hemayetpur (West)":       { cluster: "DHK-NW", subCluster: "NW8", corridor: "N-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.NW8.label, note: "Beyond core delivery radius" },

  // ────────── DHK-CW (Central / West) ──────────
  // CW1 — Moghbazar + Ramna + Eskaton + Hatirpool
  "Moghbazar":               { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Moghbazar Wireless":      { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Eskaton":                 { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Hatirpool":               { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Ramna":                   { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Shahbag":                 { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Banglamotor":             { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Bijoy Nagar":             { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Arsalan":                 { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Kazi Nazrul Islam Avenue":{ cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label },
  "Shahjahanpur":            { cluster: "DHK-CW", subCluster: "CW1", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW1.label, note: "Border with CW3 / SE4" },

  // CW2 — Dhanmondi + Kalabagan + Green Road
  "Dhanmondi":               { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 1":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 2":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 3":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 4":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 5":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 6":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 7":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 8":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 9":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 10":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 11":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 12":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 13":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 14":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 15":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 16":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 17":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 18":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Dhanmondi 19":            { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "West Dhanmondi":          { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Bosila West Dhanmondi":   { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Zigatola":                { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Staff Quarter":           { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Jigatola":                { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Hazaribagh":              { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Kathalbagan":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Kalabagan":               { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Green Road":              { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Lake Circus":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Panthapath":              { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Science Lab":             { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },
  "Elephant Road":           { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label },

  // CW3 — New Market + Nilkhet + Azimpur
  "Azimpur":                 { cluster: "DHK-CW", subCluster: "CW3", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW3.label },
  "New Market":              { cluster: "DHK-CW", subCluster: "CW3", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW3.label },
  "Nilkhet":                 { cluster: "DHK-CW", subCluster: "CW3", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW3.label },
  "Pilkhana":                { cluster: "DHK-CW", subCluster: "CW3", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW3.label },

  // CW4 — Lalbagh + Chawkbazar + Old Dhaka core
  "Lalbagh":                 { cluster: "DHK-CW", subCluster: "CW4", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW4.label },
  "Lalbagh Fort":            { cluster: "DHK-CW", subCluster: "CW4", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW4.label },
  "Chawkbazar":              { cluster: "DHK-CW", subCluster: "CW4", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW4.label },
  "Old Dhaka":               { cluster: "DHK-CW", subCluster: "CW4", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW4.label },
  "Puran Dhaka":             { cluster: "DHK-CW", subCluster: "CW4", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW4.label },
  "Dhakeshwari":             { cluster: "DHK-CW", subCluster: "CW4", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW4.label },

  // CW5 — Bangshal + Sutrapur + Kotwali + Islampur
  "Bangshal":                { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Sutrapur":                { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Kotwali":                 { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Islampur":                { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Mitford":                 { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Nawabpur":                { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Patuatuli":               { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Begum Bazar":             { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Tanti Bazar":             { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Shakhari Bazar":          { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Zindabahar":              { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Nazimuddin Road":         { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label },
  "Rayer Bazar":             { cluster: "DHK-CW", subCluster: "CW5", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW5.label, note: "Mohammadpur–Dhanmondi border" },

  // CW6 — Kamrangirchar + Keraniganj (river crossing)
  "Kamrangirchar":           { cluster: "DHK-CW", subCluster: "CW6", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW6.label, note: "Confirm river-route feasibility" },
  "Keraniganj":              { cluster: "DHK-CW", subCluster: "CW6", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW6.label, note: "Far west — confirm before accepting" },
  "Aminpur":                 { cluster: "DHK-CW", subCluster: "CW6", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW6.label, note: "Far west — confirm before accepting" },
  "Zinzira":                 { cluster: "DHK-CW", subCluster: "CW6", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW6.label, note: "Far west — confirm before accepting" },

  // CW7 — Wari + Gandaria + Narinda
  "Wari":                    { cluster: "DHK-CW", subCluster: "CW7", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW7.label },
  "Gandaria":                { cluster: "DHK-CW", subCluster: "CW7", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW7.label },
  "Narinda":                 { cluster: "DHK-CW", subCluster: "CW7", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW7.label },
  "Lakshmibazar":            { cluster: "DHK-CW", subCluster: "CW7", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW7.label },
  "Tatibazar":               { cluster: "DHK-CW", subCluster: "CW7", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW7.label },
  "Banglabazar":             { cluster: "DHK-CW", subCluster: "CW7", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW7.label },

  // ────────── DHK-SE (South / Southeast) ──────────
  // SE1 — Khilgaon + Goran
  "Khilgaon":                { cluster: "DHK-SE", subCluster: "SE1", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE1.label },
  "Khilgaon Taltola":        { cluster: "DHK-SE", subCluster: "SE1", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE1.label },
  "Khilgaon Chowdhuripara":  { cluster: "DHK-SE", subCluster: "SE1", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE1.label },
  "Goran":                   { cluster: "DHK-SE", subCluster: "SE1", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE1.label },
  "Mugdapara":               { cluster: "DHK-SE", subCluster: "SE1", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE1.label },

  // SE2 — Bashabo + Sabujbagh + Madartek
  "Bashabo":                 { cluster: "DHK-SE", subCluster: "SE2", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE2.label },
  "Bashabo B Block":         { cluster: "DHK-SE", subCluster: "SE2", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE2.label },
  "Bashabo C Block":         { cluster: "DHK-SE", subCluster: "SE2", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE2.label },
  "Bashabo D Block":         { cluster: "DHK-SE", subCluster: "SE2", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE2.label },
  "Bashabo T Block":         { cluster: "DHK-SE", subCluster: "SE2", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE2.label },
  "Madartek":                { cluster: "DHK-SE", subCluster: "SE2", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE2.label },
  "Sabujbagh":               { cluster: "DHK-SE", subCluster: "SE2", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE2.label },
  "Maniknagar":              { cluster: "DHK-SE", subCluster: "SE2", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE2.label },

  // SE3 — Malibagh + Shantinagar + Fakirapool
  "Malibagh":                { cluster: "DHK-SE", subCluster: "SE3", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE3.label },
  "Malibagh Chowdhurypara":  { cluster: "DHK-SE", subCluster: "SE3", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE3.label },
  "Malibagh Railgate":       { cluster: "DHK-SE", subCluster: "SE3", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE3.label },
  "Shantinagar":             { cluster: "DHK-SE", subCluster: "SE3", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE3.label },
  "Fakirapool":              { cluster: "DHK-SE", subCluster: "SE3", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE3.label },
  "Tikatuli":                { cluster: "DHK-SE", subCluster: "SE3", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE3.label },

  // SE4 — Motijheel + Paltan + Kakrail + Kamalapur
  "Motijheel":               { cluster: "DHK-SE", subCluster: "SE4", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE4.label },
  "Motijheel Taltola":       { cluster: "DHK-SE", subCluster: "SE4", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE4.label },
  "Paltan":                  { cluster: "DHK-SE", subCluster: "SE4", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE4.label },
  "Naya Paltan":             { cluster: "DHK-SE", subCluster: "SE4", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE4.label },
  "Kakrail":                 { cluster: "DHK-SE", subCluster: "SE4", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE4.label },
  "Arambagh":                { cluster: "DHK-SE", subCluster: "SE4", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE4.label },

  // SE5 — Mugda
  "Mugda":                   { cluster: "DHK-SE", subCluster: "SE5", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE5.label },

  // SE6 — Jatrabari + Dhalpur + Donia
  "Jatrabari":               { cluster: "DHK-SE", subCluster: "SE6", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE6.label },
  "Dholpur":                 { cluster: "DHK-SE", subCluster: "SE6", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE6.label },
  "Donia":                   { cluster: "DHK-SE", subCluster: "SE6", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE6.label },
  "Rayerbag":                { cluster: "DHK-SE", subCluster: "SE6", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE6.label },

  // SE7 — Shyampur + Kadamtali + Postogola
  "Shyampur":                { cluster: "DHK-SE", subCluster: "SE7", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE7.label },
  "Kadamtali":               { cluster: "DHK-SE", subCluster: "SE7", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE7.label },
  "Sultanganj":              { cluster: "DHK-SE", subCluster: "SE7", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE7.label },

  // SE8 — Matuail + Demra + Sarulia
  "Matuail":                 { cluster: "DHK-SE", subCluster: "SE8", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE8.label },
  "Demra":                   { cluster: "DHK-SE", subCluster: "SE8", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE8.label, note: "Industrial belt — confirm road access" },
  "Sarulia":                 { cluster: "DHK-SE", subCluster: "SE8", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE8.label },
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Lower-cased, trimmed map for fast case-insensitive lookup. */
const LOCATIONS_LOOKUP: Map<string, AreaLocation> = (() => {
  const m = new Map<string, AreaLocation>();
  for (const [k, v] of Object.entries(LOCATIONS)) {
    m.set(k.toLowerCase().trim(), v);
  }
  return m;
})();

/**
 * Look up the cluster + sub-cluster for an area name. Falls back to a
 * heuristic based on the area-centroid zone if no explicit assignment exists,
 * so newly-added area names still get a sensible cluster. Ultimate fallback
 * is DHK-E (cluster the hub sits in) with subCluster E1.
 */
export function getLocationForArea(area: string | null | undefined): AreaLocation {
  const fallback: AreaLocation = LOCATIONS["Aftabnagar"];
  if (!area) return fallback;
  const q = area.toLowerCase().trim();
  if (!q) return fallback;
  const exact = LOCATIONS_LOOKUP.get(q);
  if (exact) return exact;
  // Substring fallback (handles "Bashundhara Block A" type partial matches)
  for (const [name, loc] of LOCATIONS_LOOKUP) {
    if (name.includes(q) || q.includes(name)) return loc;
  }
  // No explicit map entry — derive from the centroid's quadrant.
  const centroid = getAreaCentroid(area);
  switch (centroid.zone) {
    case "NW": return { cluster: "DHK-NW", subCluster: "NW3", corridor: "N-Corridor", window: "morning", subClusterLabel: SUB_CLUSTER_META.NW3.label };
    case "NE": return { cluster: "DHK-E",  subCluster: "E2",  corridor: "E-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.E2.label };
    case "SW": return { cluster: "DHK-CW", subCluster: "CW2", corridor: "W-Corridor", window: "midday", subClusterLabel: SUB_CLUSTER_META.CW2.label };
    case "SE": return { cluster: "DHK-SE", subCluster: "SE4", corridor: "S-Corridor", window: "afternoon", subClusterLabel: SUB_CLUSTER_META.SE4.label };
    default:   return fallback;
  }
}

/** Areas belonging to a given cluster (for /locations UI). */
export function listAreasByCluster(cluster: Cluster): string[] {
  return Object.entries(LOCATIONS)
    .filter(([, v]) => v.cluster === cluster)
    .map(([k]) => k)
    .sort((a, b) => a.localeCompare(b));
}

/** Areas belonging to a given sub-cluster. */
export function listAreasBySubCluster(sub: SubCluster): string[] {
  return Object.entries(LOCATIONS)
    .filter(([, v]) => v.subCluster === sub)
    .map(([k]) => k)
    .sort((a, b) => a.localeCompare(b));
}

/** Sub-clusters with their area lists — used by /locations page. */
export function listSubClusterSummaries(): Array<{
  subCluster: SubCluster;
  cluster: Cluster;
  label: string;
  corridor: Corridor;
  window: DispatchWindow;
  note?: string;
  areaCount: number;
  areas: string[];
}> {
  const subs: SubCluster[] = [
    "E1","E2","E3","E4","E5","E6",
    "NW1","NW2","NW3","NW4","NW5","NW6","NW7","NW8",
    "CW1","CW2","CW3","CW4","CW5","CW6","CW7",
    "SE1","SE2","SE3","SE4","SE5","SE6","SE7","SE8",
  ];
  return subs.map((sub) => {
    const areas = listAreasBySubCluster(sub);
    const sample = LOCATIONS[areas[0]];
    return {
      subCluster: sub,
      cluster: sample?.cluster ?? "DHK-E",
      label: SUB_CLUSTER_META[sub].label,
      corridor: sample?.corridor ?? "Hub-Adjacent",
      window: sample?.window ?? "afternoon",
      note: sample?.note,
      areaCount: areas.length,
      areas,
    };
  });
}

/** Total area count we have clustered (for diagnostics + UI). */
export const CLUSTERED_AREA_COUNT = Object.keys(LOCATIONS).length;

/** Centroids that have NO location entry — surfaces gaps in the master table. */
export function listUnclusteredAreas(): string[] {
  return Object.keys(DHAKA_CENTROIDS_RAW).filter(
    (a) => !LOCATIONS_LOOKUP.has(a.toLowerCase().trim()),
  );
}

// Re-export so callers don't have to import from two places.
export { DHAKA_CENTROIDS_RAW, DEFAULT_CENTROID, getAreaCentroid };
export type { AreaCentroid };
