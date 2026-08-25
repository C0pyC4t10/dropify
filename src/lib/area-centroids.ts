/**
 * Hand-curated + OSM-verified centroid coordinates for Dhaka Metro neighborhoods.
 *
 * Each entry includes:
 *  - lat/lng: neighborhood centroid (accurate to ~100-200m, sourced from
 *    OpenStreetMap via Photon API + hand-curation for sub-blocks that
 *    aren't on OSM)
 *  - zone: 4-part Dhaka-metro quadrant (relative to Dhaka center ~23.74, 90.40):
 *      - "NW" = North-West (Uttara, Mirpur, Mohammadpur)
 *      - "NE" = North-East (Gulshan, Bashundhara, Badda, Rampura, Moghbazar)
 *      - "SW" = South-West (Dhanmondi, Old Dhaka, Lalbagh, Mohammadpur West)
 *      - "SE" = South-East (Motijheel, Jatrabari, Demra, Wari)
 *  - district: sub-area grouping for the planner UI
 *
 * No proprietary data — these are public area names with hand-curated/OSM
 * centroids. Used as the default coordinate source for orders and customers
 * that don't have a manual pin-drop set.
 */
export interface AreaCentroid {
  lat: number;
  lng: number;
  /** "NW" | "NE" | "SW" | "SE" */
  zone?: "NW" | "NE" | "SW" | "SE";
  /** Sub-area grouping for UI display. */
  district?: string;
  /** Optional Bangladesh postal code. */
  postcode?: string;
}

/**
 * Dhaka-metro 4-quadrant reference point. The 23.74/90.40 point sits between
 * Shahbag and Motijheel — roughly the geographic centre of old Dhaka — which
 * is the most balanced pivot for the NW/NE/SW/SE quadrant split.
 */
export const DHAKA_CENTER = { lat: 23.74, lng: 90.40 } as const;

/**
 * Classify a point into one of Dhaka's 4 quadrants relative to the centre.
 * Returns "NW" if north-west, etc. For points exactly on the centre line we
 * default to "N" or "S" depending on lat (rare in practice).
 */
export function getQuadrantFromCenter(lat: number, lng: number): "NW" | "NE" | "SW" | "SE" {
  const ns = lat >= DHAKA_CENTER.lat ? "N" : "S";
  const ew = lng >= DHAKA_CENTER.lng ? "E" : "W";
  return (ns + ew) as "NW" | "NE" | "SW" | "SE";
}

/**
 * Classify a point into one of 4 quadrants relative to a custom reference
 * (typically the shop). Used by the "plan without rider" preview to colour
 * pins by direction from the shop.
 */
export function getQuadrantFromRef(
  lat: number,
  lng: number,
  ref: { lat: number; lng: number },
): "NW" | "NE" | "SW" | "SE" {
  const ns = lat >= ref.lat ? "N" : "S";
  const ew = lng >= ref.lng ? "E" : "W";
  return (ns + ew) as "NW" | "NE" | "SW" | "SE";
}

export const DHAKA_CENTROIDS_RAW: Record<string, AreaCentroid> = {
  // ===========================================================================
  // NORTH-WEST (NW) — Uttara, Mirpur, Mohammadpur, Agargaon, Cantonment, Banani
  // ===========================================================================

  // -- Uttara + Sector 1-15 --
  "Uttara": { lat: 23.875, lng: 90.379, zone: "NW", district: "Uttara" },
  "Uttara Sector 1": { lat: 23.877, lng: 90.376, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 2": { lat: 23.875, lng: 90.381, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 3": { lat: 23.873, lng: 90.385, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 4": { lat: 23.873, lng: 90.39, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 5": { lat: 23.876, lng: 90.391, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 6": { lat: 23.878, lng: 90.388, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 7": { lat: 23.881, lng: 90.385, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 8": { lat: 23.882, lng: 90.382, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 9": { lat: 23.88, lng: 90.379, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 10": { lat: 23.878, lng: 90.376, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 11": { lat: 23.876, lng: 90.373, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 12": { lat: 23.873, lng: 90.373, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 13": { lat: 23.871, lng: 90.376, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 14": { lat: 23.871, lng: 90.382, zone: "NW", district: "Uttara", postcode: "1230" },
  "Uttara Sector 15": { lat: 23.87, lng: 90.387, zone: "NW", district: "Uttara", postcode: "1230" },
  "Azampur": { lat: 23.874, lng: 90.392, zone: "NW", district: "Uttara" },
  "Diabari": { lat: 23.882, lng: 90.394, zone: "NW", district: "Uttara" },
  "Kamarpara": { lat: 23.873, lng: 90.397, zone: "NW", district: "Uttara" },
  "Rajlokkhi": { lat: 23.872, lng: 90.405, zone: "NW", district: "Uttara" },
  "Bawlia": { lat: 23.88, lng: 90.41, zone: "NW", district: "Uttara" },
  "Tongi": { lat: 23.89, lng: 90.403, zone: "NW", district: "Tongi" },
  "Gazipur": { lat: 23.995, lng: 90.42, zone: "NW", district: "Gazipur" },
  "Kashimpur": { lat: 23.95, lng: 90.39, zone: "NW", district: "Gazipur" },
  "Konabari": { lat: 23.97, lng: 90.41, zone: "NW", district: "Gazipur" },

  // -- Mirpur (overall + 1-14, DOHS, Cantonment) --
  "Mirpur": { lat: 23.812, lng: 90.364, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur DOHS": { lat: 23.837, lng: 90.369, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur Cantonment": { lat: 23.839, lng: 90.36, zone: "NW", district: "Mirpur Cantonment", postcode: "1216" },
  "Mirpur 1": { lat: 23.808, lng: 90.355, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 2": { lat: 23.806, lng: 90.363, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 3": { lat: 23.808, lng: 90.37, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 4": { lat: 23.81, lng: 90.376, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 5": { lat: 23.811, lng: 90.381, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 6": { lat: 23.804, lng: 90.36, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 7": { lat: 23.818, lng: 90.363, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 8": { lat: 23.81, lng: 90.37, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 9": { lat: 23.832, lng: 90.374, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 10": { lat: 23.81, lng: 90.373, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 11": { lat: 23.817, lng: 90.371, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 12": { lat: 23.823, lng: 90.368, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 13": { lat: 23.806, lng: 90.378, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Mirpur 14": { lat: 23.823, lng: 90.367, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Pallabi": { lat: 23.827, lng: 90.364, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Kazipara": { lat: 23.797, lng: 90.366, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Shewrapara": { lat: 23.793, lng: 90.37, zone: "NW", district: "Mirpur", postcode: "1216" },
  "Kafrul": { lat: 23.789, lng: 90.385, zone: "NW", district: "Mirpur", postcode: "1206" },
  "Agargaon": { lat: 23.78, lng: 90.385, zone: "NW", district: "Mirpur", postcode: "1207" },
  "Monipur": { lat: 23.787, lng: 90.38, zone: "NW", district: "Mirpur" },
  "Ibrahimpur": { lat: 23.789, lng: 90.378, zone: "NW", district: "Mirpur" },
  "Manikdi": { lat: 23.823, lng: 90.385, zone: "NW", district: "Mirpur" },
  "Vashantek": { lat: 23.815, lng: 90.385, zone: "NW", district: "Mirpur" },
  "Duaripara": { lat: 23.823, lng: 90.378, zone: "NW", district: "Mirpur" },
  "Beribadh": { lat: 23.78, lng: 90.345, zone: "NW", district: "Mirpur" },
  "Rupnagar": { lat: 23.808, lng: 90.358, zone: "NW", district: "Mirpur" },
  "Senpara": { lat: 23.823, lng: 90.382, zone: "NW", district: "Mirpur" },
  "Ahmed Nagar": { lat: 23.81, lng: 90.36, zone: "NW", district: "Mirpur" },

  // -- Banani / Cantonment --
  "Banani": { lat: 23.793, lng: 90.404, zone: "NW", district: "Banani", postcode: "1213" },
  "Banani DOHS": { lat: 23.798, lng: 90.398, zone: "NW", district: "Banani", postcode: "1206" },
  "Cantonment": { lat: 23.79, lng: 90.39, zone: "NW", district: "Cantonment", postcode: "1206" },

  // -- Mohammadpur / West --
  "Mohammadpur": { lat: 23.76, lng: 90.36, zone: "NW", district: "Mohammadpur", postcode: "1207" },
  "Town Hall": { lat: 23.744, lng: 90.388, zone: "NW", district: "Mohammadpur" },
  "Bosila": { lat: 23.755, lng: 90.353, zone: "NW", district: "Mohammadpur" },
  "Shyamoli": { lat: 23.769, lng: 90.368, zone: "NW", district: "Mohammadpur", postcode: "1207" },
  "Adabor": { lat: 23.765, lng: 90.358, zone: "NW", district: "Mohammadpur" },
  "Ring Road (Mohammadpur)": { lat: 23.755, lng: 90.365, zone: "NW", district: "Mohammadpur" },
  "Lalmatia": { lat: 23.755, lng: 90.37, zone: "NW", district: "Mohammadpur" },
  "Hossain Market": { lat: 23.76, lng: 90.368, zone: "NW", district: "Mohammadpur" },
  "Kallyanpur": { lat: 23.775, lng: 90.365, zone: "NW", district: "Mohammadpur" },
  "Pirerbag": { lat: 23.778, lng: 90.37, zone: "NW", district: "Mohammadpur" },
  "Amin Bazar": { lat: 23.78, lng: 90.33, zone: "NW", district: "Savar" },
  "Hemayetpur": { lat: 23.79, lng: 90.315, zone: "NW", district: "Savar" },
  "Aga Nagar": { lat: 23.78, lng: 90.31, zone: "NW", district: "Savar" },
  "Savar": { lat: 23.858, lng: 90.265, zone: "NW", district: "Savar" },
  "Birulia": { lat: 23.81, lng: 90.29, zone: "NW", district: "Savar" },
  "Dhamrai": { lat: 23.91, lng: 90.23, zone: "NW", district: "Dhamrai" },
  "Beribadh (West)": { lat: 23.76, lng: 90.345, zone: "NW", district: "Savar" },
  "Hemayetpur (West)": { lat: 23.79, lng: 90.315, zone: "NW", district: "Savar" },

  // ===========================================================================
  // NORTH-EAST (NE) — Gulshan, Bashundhara, Badda, Rampura, Moghbazar, Khilgaon
  // ===========================================================================

  // -- Gulshan / Baridhara / Banani east --
  "Gulshan": { lat: 23.792, lng: 90.416, zone: "NE", district: "Gulshan", postcode: "1212" },
  "Gulshan 1": { lat: 23.781, lng: 90.417, zone: "NE", district: "Gulshan", postcode: "1212" },
  "Gulshan 2": { lat: 23.795, lng: 90.414, zone: "NE", district: "Gulshan", postcode: "1212" },
  "Gulshan Circle 1": { lat: 23.792, lng: 90.408, zone: "NE", district: "Gulshan", postcode: "1212" },
  "Gulshan Circle 2": { lat: 23.798, lng: 90.412, zone: "NE", district: "Gulshan", postcode: "1212" },
  "Baridhara": { lat: 23.795, lng: 90.42, zone: "NE", district: "Baridhara", postcode: "1212" },
  "Baridhara DOHS": { lat: 23.802, lng: 90.418, zone: "NE", district: "Baridhara", postcode: "1206" },
  "Niketan": { lat: 23.79, lng: 90.415, zone: "NE", district: "Gulshan", postcode: "1212" },
  "Bashundhara R/A": { lat: 23.819, lng: 90.437, zone: "NE", district: "Bashundhara", postcode: "1229" },
  "Bashundhara Block A": { lat: 23.815, lng: 90.43, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block B": { lat: 23.816, lng: 90.435, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block C": { lat: 23.819, lng: 90.438, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block D": { lat: 23.82, lng: 90.442, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block E": { lat: 23.823, lng: 90.444, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block F": { lat: 23.825, lng: 90.448, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block G": { lat: 23.827, lng: 90.451, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block H": { lat: 23.829, lng: 90.453, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block I": { lat: 23.831, lng: 90.456, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block J": { lat: 23.833, lng: 90.458, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block K": { lat: 23.835, lng: 90.461, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block L": { lat: 23.837, lng: 90.463, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block M": { lat: 23.839, lng: 90.466, zone: "NE", district: "Bashundhara" },
  "Bashundhara Block N": { lat: 23.84, lng: 90.468, zone: "NE", district: "Bashundhara" },
  "Kuratoli": { lat: 23.828, lng: 90.427, zone: "NE", district: "Bashundhara" },
  "Khilkhet": { lat: 23.83, lng: 90.42, zone: "NE", district: "Khilkhet" },
  "Notun Bazar": { lat: 23.795, lng: 90.425, zone: "NE", district: "Gulshan", postcode: "1212" },

  // -- Badda / Aftabnagar / Merul --
  "Badda": { lat: 23.78, lng: 90.425, zone: "NE", district: "Badda", postcode: "1212" },
  "Badda (Gulshan)": { lat: 23.785, lng: 90.422, zone: "NE", district: "Badda" },
  "Badda Link Road": { lat: 23.782, lng: 90.428, zone: "NE", district: "Badda" },
  "Merul Badda": { lat: 23.775, lng: 90.425, zone: "NE", district: "Badda" },
  "North Badda": { lat: 23.787, lng: 90.425, zone: "NE", district: "Badda" },
  "Middle Badda": { lat: 23.78, lng: 90.425, zone: "NE", district: "Badda" },
  "South Badda": { lat: 23.775, lng: 90.425, zone: "NE", district: "Badda" },
  "Aftabnagar": { lat: 23.766, lng: 90.445, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar East": { lat: 23.768, lng: 90.46, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar West": { lat: 23.762, lng: 90.435, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar Sector 1": { lat: 23.767, lng: 90.448, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar Sector 2": { lat: 23.766, lng: 90.4547, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar Sector 3": { lat: 23.769, lng: 90.455, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar Sector 4": { lat: 23.7725, lng: 90.4552, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar Sector 5": { lat: 23.7756, lng: 90.4555, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar M Block": { lat: 23.769, lng: 90.455, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar N Block": { lat: 23.773, lng: 90.456, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar B Block": { lat: 23.766, lng: 90.45, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar C Block": { lat: 23.766, lng: 90.452, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar D Block": { lat: 23.766, lng: 90.454, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar E Block": { lat: 23.77, lng: 90.453, zone: "NE", district: "Aftabnagar" },
  "Aftabnagar F Block": { lat: 23.77, lng: 90.455, zone: "NE", district: "Aftabnagar" },
  "Joar Sahara": { lat: 23.778, lng: 90.451, zone: "NE", district: "Aftabnagar" },
  "Solmaid": { lat: 23.79, lng: 90.435, zone: "NE", district: "Badda" },
  "East Rampura": { lat: 23.762, lng: 90.422, zone: "NE", district: "Rampura" },
  "Sipahi Bagicha": { lat: 23.755, lng: 90.41, zone: "NE", district: "Rampura" },

  // -- Rampura / Banasree / Bonosree --
  "Rampura": { lat: 23.763, lng: 90.418, zone: "NE", district: "Rampura", postcode: "1219" },
  "Rampura TV Center": { lat: 23.759, lng: 90.417, zone: "NE", district: "Rampura" },
  "Banasree": { lat: 23.76, lng: 90.43, zone: "NE", district: "Banasree", postcode: "1219" },
  "Banasree Block A": { lat: 23.762, lng: 90.43, zone: "NE", district: "Banasree" },
  "Banasree Block B": { lat: 23.76, lng: 90.432, zone: "NE", district: "Banasree" },
  "Banasree Block C": { lat: 23.759, lng: 90.434, zone: "NE", district: "Banasree" },
  "Banasree Block D": { lat: 23.757, lng: 90.436, zone: "NE", district: "Banasree" },
  "Banasree Block E": { lat: 23.755, lng: 90.438, zone: "NE", district: "Banasree" },
  "Banasree Block F": { lat: 23.753, lng: 90.44, zone: "NE", district: "Banasree" },
  "Bonosree": { lat: 23.755, lng: 90.435, zone: "NE", district: "Bonosree" },
  "South Bonosree": { lat: 23.748, lng: 90.438, zone: "NE", district: "Bonosree" },
  "Manda": { lat: 23.757, lng: 90.441, zone: "NE", district: "Manda" },
  "Dumni": { lat: 23.825, lng: 90.467, zone: "NE", district: "Bashundhara" },
  "Pink City": { lat: 23.823, lng: 23.823, zone: "NE", district: "Bashundhara" },

  // -- Khilgaon / Malibagh / Goran --
  "Khilgaon": { lat: 23.749, lng: 90.418, zone: "NE", district: "Khilgaon", postcode: "1219" },
  "Khilgaon Taltola": { lat: 23.747, lng: 90.422, zone: "NE", district: "Khilgaon" },
  "Khilgaon Chowdhuripara": { lat: 23.751, lng: 90.42, zone: "NE", district: "Khilgaon" },
  "Mugdapara": { lat: 23.735, lng: 90.425, zone: "NE", district: "Mugdapara" },
  "Goran": { lat: 23.74, lng: 90.422, zone: "NE", district: "Goran" },
  "Malibagh": { lat: 23.753, lng: 90.408, zone: "NE", district: "Malibagh" },
  "Malibagh Chowdhurypara": { lat: 23.751, lng: 90.41, zone: "NE", district: "Malibagh" },
  "Malibagh Railgate": { lat: 23.755, lng: 90.41, zone: "NE", district: "Malibagh" },

  // -- Moghbazar / Eskaton / Shantinagar / Hatirpool --
  "Moghbazar": { lat: 23.749, lng: 90.402, zone: "NE", district: "Moghbazar", postcode: "1217" },
  "Moghbazar Wireless": { lat: 23.751, lng: 90.403, zone: "NE", district: "Moghbazar" },
  "Eskaton": { lat: 23.743, lng: 90.408, zone: "NE", district: "Eskaton", postcode: "1217" },
  "Hatirpool": { lat: 23.747, lng: 90.397, zone: "NE", district: "Hatirpool" },
  "Shantinagar": { lat: 23.742, lng: 90.41, zone: "NE", district: "Shantinagar", postcode: "1217" },
  "Mohanagar": { lat: 23.75, lng: 90.385, zone: "NE", district: "Mohammadpur" },
  "Kathalbagan": { lat: 23.751, lng: 90.388, zone: "NE", district: "Dhanmondi" },
  "Green Road": { lat: 23.755, lng: 90.385, zone: "NE", district: "Dhanmondi" },
  "Lake Circus": { lat: 23.749, lng: 90.385, zone: "NE", district: "Dhanmondi" },
  "Kalabagan": { lat: 23.748, lng: 90.385, zone: "NE", district: "Kalabagan" },
  "Panthapath": { lat: 23.751, lng: 90.388, zone: "NE", district: "Panthapath" },
  "Karwan Bazar": { lat: 23.749, lng: 90.392, zone: "NE", district: "Karwan Bazar" },
  "Bijoy Nagar": { lat: 23.745, lng: 90.395, zone: "NE", district: "Central" },
  "Arsalan": { lat: 23.745, lng: 90.4, zone: "NE", district: "Central" },

  // ===========================================================================
  // SOUTH-WEST (SW) — Dhanmondi, Old Dhaka, Lalbagh, Hazaribagh, Kamrangirchar
  // ===========================================================================

  // -- Dhanmondi 1-19 + West Dhanmondi --
  "Dhanmondi": { lat: 23.748, lng: 90.375, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 1": { lat: 23.744, lng: 90.376, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 2": { lat: 23.744, lng: 90.38, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 3": { lat: 23.747, lng: 90.378, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 4": { lat: 23.747, lng: 90.375, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 5": { lat: 23.748, lng: 90.372, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 6": { lat: 23.748, lng: 90.37, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 7": { lat: 23.75, lng: 90.37, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 8": { lat: 23.75, lng: 90.373, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 9": { lat: 23.751, lng: 90.376, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 10": { lat: 23.751, lng: 90.38, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 11": { lat: 23.749, lng: 90.38, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 12": { lat: 23.748, lng: 90.382, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 13": { lat: 23.745, lng: 90.382, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 14": { lat: 23.743, lng: 90.38, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 15": { lat: 23.741, lng: 90.378, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 16": { lat: 23.74, lng: 90.376, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 17": { lat: 23.74, lng: 90.373, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 18": { lat: 23.742, lng: 90.372, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "Dhanmondi 19": { lat: 23.744, lng: 90.37, zone: "SW", district: "Dhanmondi", postcode: "1205" },
  "West Dhanmondi": { lat: 23.746, lng: 90.37, zone: "SW", district: "West Dhanmondi" },
  "Bosila West Dhanmondi": { lat: 23.744, lng: 90.35, zone: "SW", district: "West Dhanmondi" },
  "Zigatola": { lat: 23.742, lng: 90.376, zone: "SW", district: "Dhanmondi" },
  "Staff Quarter": { lat: 23.74, lng: 90.378, zone: "SW", district: "Dhanmondi" },
  "Rayer Bazar": { lat: 23.74, lng: 90.367, zone: "SW", district: "Mohammadpur" },
  "Hazaribagh": { lat: 23.737, lng: 90.368, zone: "SW", district: "Hazaribagh", postcode: "1205" },
  "Jigatola": { lat: 23.74, lng: 90.375, zone: "SW", district: "Dhanmondi" },

  // -- Old Dhaka, Lalbagh, Chawkbazar --
  "Old Dhaka": { lat: 23.715, lng: 90.395, zone: "SW", district: "Old Dhaka", postcode: "1100" },
  "Puran Dhaka": { lat: 23.71, lng: 90.4, zone: "SW", district: "Old Dhaka" },
  "Lalbagh": { lat: 23.718, lng: 90.388, zone: "SW", district: "Lalbagh", postcode: "1211" },
  "Lalbagh Fort": { lat: 23.72, lng: 90.388, zone: "SW", district: "Lalbagh" },
  "Chawkbazar": { lat: 23.716, lng: 90.395, zone: "SW", district: "Chawkbazar", postcode: "1211" },
  "Islampur": { lat: 23.708, lng: 90.405, zone: "SW", district: "Old Dhaka", postcode: "1100" },
  "Bangshal": { lat: 23.716, lng: 90.405, zone: "SW", district: "Bangshal", postcode: "1100" },
  "Sutrapur": { lat: 23.714, lng: 90.408, zone: "SW", district: "Sutrapur", postcode: "1100" },
  "Kotwali": { lat: 23.713, lng: 90.408, zone: "SW", district: "Old Dhaka", postcode: "1100" },
  "Kamrangirchar": { lat: 23.708, lng: 90.38, zone: "SW", district: "Kamrangirchar", postcode: "1211" },
  "Keraniganj": { lat: 23.698, lng: 90.355, zone: "SW", district: "Keraniganj" },
  "Mitford": { lat: 23.71, lng: 90.4, zone: "SW", district: "Old Dhaka", postcode: "1100" },
  "Nawabpur": { lat: 23.713, lng: 90.402, zone: "SW", district: "Old Dhaka", postcode: "1100" },
  "Patuatuli": { lat: 23.712, lng: 90.398, zone: "SW", district: "Old Dhaka" },
  "Begum Bazar": { lat: 23.71, lng: 90.403, zone: "SW", district: "Old Dhaka" },
  "Tanti Bazar": { lat: 23.708, lng: 90.4, zone: "SW", district: "Old Dhaka" },
  "Shakhari Bazar": { lat: 23.711, lng: 90.395, zone: "SW", district: "Old Dhaka" },
  "Aminpur": { lat: 23.7, lng: 90.39, zone: "SW", district: "Keraniganj" },
  "Zindabahar": { lat: 23.715, lng: 90.405, zone: "SW", district: "Old Dhaka" },
  "Zinzira": { lat: 23.7, lng: 90.36, zone: "SW", district: "Keraniganj" },
  "Nazimuddin Road": { lat: 23.715, lng: 90.398, zone: "SW", district: "Old Dhaka" },
  "Dhakeshwari": { lat: 23.72, lng: 90.385, zone: "SW", district: "Lalbagh" },
  "Shahjahanpur": { lat: 23.74, lng: 90.4, zone: "SW", district: "Central" },
  "Pilkhana": { lat: 23.735, lng: 90.388, zone: "SW", district: "Azimpur" },

  // -- Azimpur / New Market / Nilkhet --
  "Azimpur": { lat: 23.73, lng: 90.388, zone: "SW", district: "Azimpur" },
  "New Market": { lat: 23.733, lng: 90.385, zone: "SW", district: "New Market" },
  "Nilkhet": { lat: 23.734, lng: 90.392, zone: "SW", district: "Nilkhet" },
  "Banglamotor": { lat: 23.741, lng: 90.394, zone: "SW", district: "Banglamotor" },
  "Science Lab": { lat: 23.739, lng: 90.384, zone: "SW", district: "Science Lab" },
  "Elephant Road": { lat: 23.737, lng: 90.385, zone: "SW", district: "Elephant Road" },

  // ===========================================================================
  // SOUTH-EAST (SE) — Motijheel, Paltan, Kakrail, Wari, Jatrabari, Demra, Sabujbagh
  // ===========================================================================

  // -- Motijheel / Paltan / Ramna --
  "Motijheel": { lat: 23.733, lng: 90.418, zone: "SE", district: "Motijheel", postcode: "1000" },
  "Motijheel Taltola": { lat: 23.731, lng: 90.42, zone: "SE", district: "Motijheel" },
  "Paltan": { lat: 23.735, lng: 90.41, zone: "SE", district: "Paltan", postcode: "1000" },
  "Kakrail": { lat: 23.737, lng: 90.412, zone: "SE", district: "Kakrail" },
  "Arambagh": { lat: 23.738, lng: 90.408, zone: "SE", district: "Arambagh" },
  "Ramna": { lat: 23.74, lng: 90.405, zone: "SE", district: "Ramna" },
  "Shahbag": { lat: 23.739, lng: 90.395, zone: "SE", district: "Shahbag", postcode: "1207" },
  "Fakirapool": { lat: 23.736, lng: 90.405, zone: "SE", district: "Fakirapool" },
  "Naya Paltan": { lat: 23.738, lng: 90.412, zone: "SE", district: "Paltan" },
  "Tikatuli": { lat: 23.73, lng: 90.405, zone: "SE", district: "Tikatuli" },
  "Kazi Nazrul Islam Avenue": { lat: 23.755, lng: 90.392, zone: "SE", district: "Central" },
  "Bashabo": { lat: 23.735, lng: 90.43, zone: "SE", district: "Bashabo" },
  "Bashabo B Block": { lat: 23.737, lng: 90.432, zone: "SE", district: "Bashabo" },
  "Bashabo C Block": { lat: 23.738, lng: 90.434, zone: "SE", district: "Bashabo" },
  "Bashabo D Block": { lat: 23.735, lng: 90.434, zone: "SE", district: "Bashabo" },
  "Bashabo T Block": { lat: 23.733, lng: 90.43, zone: "SE", district: "Bashabo" },
  "Madartek": { lat: 23.74, lng: 90.435, zone: "SE", district: "Bashabo" },

  // -- Wari / Gandaria / Narinda --
  "Wari": { lat: 23.722, lng: 90.418, zone: "SE", district: "Wari", postcode: "1203" },
  "Gandaria": { lat: 23.716, lng: 90.417, zone: "SE", district: "Gandaria", postcode: "1204" },
  "Narinda": { lat: 23.72, lng: 90.41, zone: "SE", district: "Wari" },
  "Lakshmibazar": { lat: 23.717, lng: 90.41, zone: "SE", district: "Old Dhaka" },
  "Tatibazar": { lat: 23.715, lng: 90.41, zone: "SE", district: "Old Dhaka" },
  "Banglabazar": { lat: 23.715, lng: 90.408, zone: "SE", district: "Old Dhaka" },

  // -- Mugda / Maniknagar / Sabujbagh --
  "Mugda": { lat: 23.732, lng: 90.428, zone: "SE", district: "Mugda" },
  "Maniknagar": { lat: 23.737, lng: 90.428, zone: "SE", district: "Maniknagar" },
  "Sabujbagh": { lat: 23.731, lng: 90.435, zone: "SE", district: "Sabujbagh" },

  // -- Jatrabari / Demra / Kadamtali / Shyampur --
  "Jatrabari": { lat: 23.713, lng: 90.43, zone: "SE", district: "Jatrabari", postcode: "1204" },
  "Demra": { lat: 23.71, lng: 90.47, zone: "SE", district: "Demra" },
  "Shyampur": { lat: 23.705, lng: 90.422, zone: "SE", district: "Shyampur" },
  "Kadamtali": { lat: 23.7, lng: 90.44, zone: "SE", district: "Kadamtali" },
  "Matuail": { lat: 23.745, lng: 90.452, zone: "SE", district: "Matuail" },
  "Sultanganj": { lat: 23.722, lng: 90.435, zone: "SE", district: "Sultanganj" },
  "Donia": { lat: 23.71, lng: 90.46, zone: "SE", district: "Demra" },
  "Sarulia": { lat: 23.708, lng: 90.44, zone: "SE", district: "Demra" },
  "Dholpur": { lat: 23.715, lng: 90.45, zone: "SE", district: "Demra" },
  "Rayerbag": { lat: 23.72, lng: 90.44, zone: "SE", district: "Demra" },
};

// ===========================================================================
// Lookup helpers
// ===========================================================================

/** Map of area name (lowercased) → centroid. Built once at module load. */
const DHAKA_CENTROIDS: Map<string, AreaCentroid> = (() => {
  const m = new Map<string, AreaCentroid>();
  for (const [k, v] of Object.entries(DHAKA_CENTROIDS_RAW)) {
    m.set(k.toLowerCase().trim(), v);
  }
  return m;
})();

/** Default fallback centroid (Aftabnagar, in M Block area). */
export const DEFAULT_CENTROID: AreaCentroid = DHAKA_CENTROIDS_RAW["Aftabnagar"];

/**
 * Look up a centroid for an area name. Tries direct match, then case-insensitive
 * match, then a simple substring match (the first substring key that contains
 * the query, or vice versa). Falls back to DEFAULT_CENTROID.
 */
export function getAreaCentroid(area: string | null | undefined): AreaCentroid {
  if (!area) return DEFAULT_CENTROID;
  const q = area.toLowerCase().trim();
  if (!q) return DEFAULT_CENTROID;

  const exact = DHAKA_CENTROIDS.get(q);
  if (exact) return exact;

  // Substring: any known area whose name contains the query, or vice versa.
  for (const [name, c] of DHAKA_CENTROIDS) {
    if (name.includes(q) || q.includes(name)) return c;
  }

  return DEFAULT_CENTROID;
}

/** Number of area centroids we have curated. Used for sanity checks. */
export const AREA_CENTROID_COUNT = DHAKA_CENTROIDS_RAW.length;

/**
 * Plain serializable list of centroids for DB seeding (scripts/seed-area-centroids.cjs
 * and any future admin-UI listing). Order: by zone, then area.
 */
export function listAreaCentroids(): Array<{
  area: string;
  lat: number;
  lng: number;
  zone: string | null;
  district: string | null;
  postcode: string | null;
}> {
  const out: Array<{
    area: string;
    lat: number;
    lng: number;
    zone: string | null;
    district: string | null;
    postcode: string | null;
  }> = [];
  for (const [k, v] of Object.entries(DHAKA_CENTROIDS_RAW)) {
    out.push({
      area: k,
      lat: v.lat,
      lng: v.lng,
      zone: v.zone ?? null,
      district: v.district ?? null,
      postcode: v.postcode ?? null,
    });
  }
  out.sort((a, b) => {
    if (a.zone !== b.zone) return (a.zone ?? "").localeCompare(b.zone ?? "");
    return a.area.localeCompare(b.area);
  });
  return out;
}

/** Distinct list of districts (for the planner UI filters). */
export function listDistricts(): string[] {
  const set = new Set<string>();
  for (const v of Object.values(DHAKA_CENTROIDS_RAW)) {
    if (v.district) set.add(v.district);
  }
  return Array.from(set).sort();
}