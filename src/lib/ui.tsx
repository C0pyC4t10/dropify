import { Fragment, type ReactNode } from "react";
import type { OrderStatus } from "@/lib/types";
import { CLUSTER_META, SUB_CLUSTER_META, type Cluster, type SubCluster } from "@/lib/locations";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  "pending-approval": "Pending Approval",
  "new": "New",
  "confirmed": "Confirmed",
  "preparing": "Preparing",
  "out-for-delivery": "Out for Delivery",
  "delivered": "Delivered",
  "cancelled": "Cancelled",
  "returned": "Returned",
};

export const STATUS_FLOW: OrderStatus[] = [
  "new",
  "confirmed",
  "preparing",
  "out-for-delivery",
  "delivered",
];

export const CATEGORY_LABELS: Record<string, string> = {
  beef: "Beef",
  chicken: "Chicken",
  mutton: "Mutton",
  offal: "Offal",
  fish: "Fish",
};

// Complete Dhaka Metro area list — grouped by major zone for easy scanning.
// Customers can still type a custom area if "Other" is chosen.
export const DHAKA_AREAS: Array<{ zone: string; areas: string[] }> = [
  {
    zone: "North Dhaka",
    areas: [
      "Uttara", "Uttara Sector 1", "Uttara Sector 2", "Uttara Sector 3", "Uttara Sector 4",
      "Uttara Sector 5", "Uttara Sector 6", "Uttara Sector 7", "Uttara Sector 8", "Uttara Sector 9",
      "Uttara Sector 10", "Uttara Sector 11", "Uttara Sector 12", "Uttara Sector 13", "Uttara Sector 14",
      "Mirpur", "Mirpur DOHS", "Mirpur 1", "Mirpur 2", "Mirpur 6", "Mirpur 10", "Mirpur 11", "Mirpur 12",
      "Mirpur 13", "Mirpur 14", "Pallabi", "Kazipara", "Shewrapara", "Kafrul", "Agargaon",
      "Monipur", "Ibrahimpur", "Cantonment", "Banani", "Banani DOHS", "Mohammadpur", "Town Hall",
      "Bosila", "Shyamoli", "Adabor", "Ring Road (Mohammadpur)",
    ],
  },
  {
    zone: "South Dhaka",
    areas: [
      "Dhanmondi", "Dhanmondi 1", "Dhanmondi 2", "Dhanmondi 3", "Dhanmondi 4", "Dhanmondi 5",
      "Dhanmondi 6", "Dhanmondi 7", "Dhanmondi 8", "Dhanmondi 9", "Dhanmondi 10", "Dhanmondi 11",
      "Dhanmondi 12", "Dhanmondi 13", "Dhanmondi 14", "Dhanmondi 15", "Dhanmondi 16", "Dhanmondi 17",
      "Dhanmondi 18", "Dhanmondi 19", "Zigatola", "Hazaribagh", "Old Dhaka", "Puran Dhaka",
      "Lalbagh", "Chawkbazar", "Islampur", "Bangshal", "Sutrapur", "Kotwali", "Kamrangirchar",
      "Keraniganj", "Jatrabari", "Demra", "Gandaria", "Wari", "Mugda", "Maniknagar",
      "Shyampur", "Kadamtali", "Sabujbagh", "Manda", "Matuail",
    ],
  },
  {
    zone: "East Dhaka",
    areas: [
      "Badda", "Badda Link Road", "Merul Badda", "Rampura", "Rampura TV Center", "Banasree",
      "Aftabnagar", "Aftabnagar East", "Aftabnagar West", "North Badda", "Middle Badda",
      "South Badda", "Khilgaon", "Khilgaon Taltola", "Khilgaon Chowdhuripara", "Mugdapara",
      "Goran", "Shahbag", "Nilkhet", "New Market", "Azimpur", "Lalbagh Fort",
      "Malibagh", "Malibagh Chowdhurypara", "Shantinagar", "Paltan", "Motijheel",
      "Arambagh", "Kakrail", "Eskaton", "Moghbazar", "Moghbazar Wireless", "Hatirpool",
      "Banglamotor", "Ramna", "Kazi Nazrul Islam Avenue",
    ],
  },
  {
    zone: "West Dhaka",
    areas: [
      "Mohammadpur", "Lalmatia", "Hossain Market", "Town Hall", "Kallyanpur", "Pirerbag",
      "Shyamoli", "Adabor", "Amin Bazar", "Hemayetpur", "Aga Nagar", "Beribadh",
      "Savar", "Birulia", "Dhamrai",
    ],
  },
  {
    zone: "Gulshan & Banani",
    areas: [
      "Gulshan 1", "Gulshan 2", "Gulshan Circle 1", "Gulshan Circle 2",
      "Baridhara", "Baridhara DOHS", "Niketan", "Bashundhara R/A", "Bashundhara City",
      "Notun Bazar", "Badda (Gulshan)", "Banani", "Banani DOHS",
    ],
  },
  {
    zone: "Central Dhaka",
    areas: [
      "Motijheel", "Paltan", "Kakrail", "Arambagh", "Banglamotor", "Ramna", "Shahbag",
      "Nilkhet", "New Market", "Azimpur", "Lalbagh", "Eskaton", "Moghbazar", "Hatirpool",
      "Malibagh", "Khilgaon", "Shantinagar", "Fakirapool", "Naya Paltan", "Tikatuli",
      "Wari", "Gandaria",
    ],
  },
  {
    zone: "Old Dhaka",
    areas: [
      "Puran Dhaka", "Chawkbazar", "Islampur", "Bangshal", "Sutrapur", "Kotwali",
      "Lalbagh", "Hazaribagh", "Kamrangirchar", "Keraniganj", "Mitford", "Nawabpur",
      "Patuatuli", "Begum Bazar", "Tanti Bazar", "Shakhari Bazar", "Aminpur",
    ],
  },
  {
    zone: "Uttara & Surroundings",
    areas: [
      "Uttara", "Uttara Sector 1", "Uttara Sector 2", "Uttara Sector 3", "Uttara Sector 4",
      "Uttara Sector 5", "Uttara Sector 6", "Uttara Sector 7", "Uttara Sector 8",
      "Uttara Sector 9", "Uttara Sector 10", "Uttara Sector 11", "Uttara Sector 12",
      "Uttara Sector 13", "Uttara Sector 14", "Uttara Sector 15",
      "Azampur", "Diabari", "Kamarpara", "Rajlokkhi", "Bawlia", "Tongi", "Gazipur",
    ],
  },
  {
    zone: "Mirpur & Surroundings",
    areas: [
      "Mirpur", "Mirpur 1", "Mirpur 2", "Mirpur 6", "Mirpur 7", "Mirpur 10", "Mirpur 11",
      "Mirpur 12", "Mirpur 13", "Mirpur 14", "Pallabi", "Kazipara", "Shewrapara",
      "Kafrul", "Monipur", "Ibrahimpur", "Agargaon", "Cantonment", "Manikdi",
      "Vashantek", "Duaripara", "Beribadh", "Rupnagar", "Kallyanpur", "Pirerbag",
    ],
  },
  {
    zone: "Badda & Rampura",
    areas: [
      "Badda", "North Badda", "Middle Badda", "South Badda", "Merul Badda", "Badda Link Road",
      "Rampura", "Rampura TV Center", "Banasree", "Aftabnagar", "Aftabnagar East",
      "Aftabnagar West", "Khilgaon", "Khilgaon Taltola", "Khilgaon Chowdhuripara", "Goran",
      "Mugdapara", "Bonosree", "Manda", "South Bonosree",
    ],
  },
];

// Flat unique list — used by the order form dropdown
export const DHAKA_AREAS_FLAT: string[] = (() => {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const group of DHAKA_AREAS) {
    for (const a of group.areas) {
      const key = a.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(a);
      }
    }
  }
  return list.sort((a, b) => a.localeCompare(b));
})();

export const PAYMENT_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  advance: "Advance",
};

/** Display label for a delivery cluster (e.g. "DHK-E — East & Northeast"). */
export const CLUSTER_LABELS: Record<Cluster, string> = Object.fromEntries(
  (Object.keys(CLUSTER_META) as Cluster[]).map((c) => [c, `${c} — ${CLUSTER_META[c].name}`])
) as Record<Cluster, string>;

/** Short cluster label for badges. */
export const CLUSTER_SHORT: Record<Cluster, string> = Object.fromEntries(
  (Object.keys(CLUSTER_META) as Cluster[]).map((c) => [c, c])
) as Record<Cluster, string>;

/** Display label for a sub-cluster (e.g. "E1 — Rampura + Banasree"). */
export const SUB_CLUSTER_LABELS: Record<SubCluster, string> = Object.fromEntries(
  (Object.keys(SUB_CLUSTER_META) as SubCluster[]).map((s) => [s, `${s} — ${SUB_CLUSTER_META[s].label}`])
) as Record<SubCluster, string>;

/** CSS color for a cluster (used in badges + map pins). */
export const CLUSTER_COLORS: Record<Cluster, string> = Object.fromEntries(
  (Object.keys(CLUSTER_META) as Cluster[]).map((c) => [c, CLUSTER_META[c].color])
) as Record<Cluster, string>;

/** All clusters in display order. */
export const ALL_CLUSTERS: Cluster[] = ["DHK-E", "DHK-NW", "DHK-CW", "DHK-SE"];

export const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  facebook: "Facebook",
  wordpress: "WordPress",
  phone: "Phone",
  whatsapp: "WhatsApp",
  walkin: "Walk-in",
};

export const SOURCE_COLORS: Record<string, string> = {
  manual: "var(--text-secondary)",
  facebook: "var(--color-info)",
  wordpress: "#21759b",
  whatsapp: "var(--color-success)",
  walkin: "var(--color-warning)",
  phone: "var(--color-purple)",
};

export const EXPENSE_CATEGORIES = [
  "utilities",
  "salary",
  "rent",
  "fuel",
  "packaging",
  "marketing",
  "maintenance",
  "office",
  "other",
] as const;

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  utilities: "Utilities",
  salary: "Salary & Wages",
  rent: "Rent",
  fuel: "Transport & Fuel",
  packaging: "Packaging",
  marketing: "Marketing",
  maintenance: "Maintenance",
  office: "Office & Admin",
  other: "Other",
};

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  utilities: "var(--color-warning)",
  salary: "var(--color-purple)",
  rent: "#21759b",
  fuel: "var(--color-info)",
  packaging: "var(--color-success)",
  marketing: "var(--color-danger)",
  maintenance: "var(--text-secondary)",
  office: "var(--text-muted)",
  other: "var(--text-muted)",
};

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bkash: "bKash",
  bank: "Bank Transfer",
  other: "Other",
};

export function formatMoney(n: number): ReactNode {
  return (
    <Fragment>
      <span className="taka">৳</span>
      {Number(n || 0).toLocaleString("en-IN")}
    </Fragment>
  );
}

/** BD-time (UTC+6) split of an ISO timestamp. */
export function bdParts(iso: string): { date: string; time: string } {
  if (!iso) return { date: "—", time: "—" };
  const d = new Date(iso);
  const bd = new Date(d.getTime() + 6 * 60 * 60 * 1000);
  return {
    date: bd.toISOString().slice(0, 10),
    time: bd.toISOString().slice(11, 16),
  };
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function activeOrderStatuses(status: OrderStatus): OrderStatus[] {
  if (status === "cancelled") return ["cancelled"];
  const idx = STATUS_FLOW.indexOf(status);
  return STATUS_FLOW.slice(idx === -1 ? 0 : idx);
}