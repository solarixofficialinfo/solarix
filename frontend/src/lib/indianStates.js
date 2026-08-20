// Indian States & Union Territories database with ISO/Vehicle Codes & Aliases

export const INDIAN_STATES = [
  { name: "Andhra Pradesh", code: "AP", aliases: ["AP", "ANDHRA"] },
  { name: "Arunachal Pradesh", code: "AR", aliases: ["AR", "ARUNACHAL"] },
  { name: "Assam", code: "AS", aliases: ["AS", "ASSAM"] },
  { name: "Bihar", code: "BR", aliases: ["BR", "BIHAR"] },
  { name: "Chhattisgarh", code: "CG", aliases: ["CG", "CT", "CHHATTISGARH"] },
  { name: "Goa", code: "GA", aliases: ["GA", "GOA"] },
  { name: "Gujarat", code: "GJ", aliases: ["GJ", "GUJ", "GUJARAT"] },
  { name: "Haryana", code: "HR", aliases: ["HR", "HAR", "HARYANA"] },
  { name: "Himachal Pradesh", code: "HP", aliases: ["HP", "HIMACHAL"] },
  { name: "Jharkhand", code: "JH", aliases: ["JH", "JHK", "JHARKHAND"] },
  { name: "Karnataka", code: "KA", aliases: ["KA", "KAR", "KARNATAKA"] },
  { name: "Kerala", code: "KL", aliases: ["KL", "KER", "KERALA"] },
  { name: "Madhya Pradesh", code: "MP", aliases: ["MP", "MADHYA"] },
  { name: "Maharashtra", code: "MH", aliases: ["MH", "MAH", "MAHARASHTRA"] },
  { name: "Manipur", code: "MN", aliases: ["MN", "MANIPUR"] },
  { name: "Meghalaya", code: "ML", aliases: ["ML", "MEGHALAYA"] },
  { name: "Mizoram", code: "MZ", aliases: ["MZ", "MIZORAM"] },
  { name: "Nagaland", code: "NL", aliases: ["NL", "NAGALAND"] },
  { name: "Odisha", code: "OR", aliases: ["OR", "OD", "ODISHA", "ORISSA"] },
  { name: "Punjab", code: "PB", aliases: ["PB", "PUNJAB"] },
  { name: "Rajasthan", code: "RJ", aliases: ["RJ", "RAJ", "RAJASTHAN"] },
  { name: "Sikkim", code: "SK", aliases: ["SK", "SIKKIM"] },
  { name: "Tamil Nadu", code: "TN", aliases: ["TN", "TAMIL", "TL", "TAMILNADU", "TAMIL NADU"] },
  { name: "Telangana", code: "TS", aliases: ["TS", "TG", "TELANGANA"] },
  { name: "Tripura", code: "TR", aliases: ["TR", "TRIPURA"] },
  { name: "Uttar Pradesh", code: "UP", aliases: ["UP", "UTTAR"] },
  { name: "Uttarakhand", code: "UK", aliases: ["UK", "UT", "UA", "UTTARAKHAND"] },
  { name: "West Bengal", code: "WB", aliases: ["WB", "BENGAL", "WEST BENGAL"] },
  
  // Union Territories
  { name: "Andaman and Nicobar Islands", code: "AN", aliases: ["AN", "ANDAMAN"] },
  { name: "Chandigarh", code: "CH", aliases: ["CH", "CHANDIGARH"] },
  { name: "Dadra and Nagar Haveli and Daman and Diu", code: "DN", aliases: ["DN", "DD", "DAMAN", "DIU", "DADRA"] },
  { name: "Delhi", code: "DL", aliases: ["DL", "DEL", "DELHI", "NCR"] },
  { name: "Jammu and Kashmir", code: "JK", aliases: ["JK", "J&K", "JAMMU"] },
  { name: "Ladakh", code: "LA", aliases: ["LA", "LADAKH"] },
  { name: "Lakshadweep", code: "LD", aliases: ["LD", "LAKSHADWEEP"] },
  { name: "Puducherry", code: "PY", aliases: ["PY", "PONDICHERRY", "PUDUCHERRY"] },
];

/**
 * Resolves an input string (e.g. "MH", "TL", "TAMIL", "Maharashtra") to the standard state object.
 * Returns null if not matched.
 */
export function resolveState(input) {
  if (!input || typeof input !== "string") return null;
  const clean = input.trim().toUpperCase();
  if (!clean) return null;

  // Direct match by code
  let found = INDIAN_STATES.find((s) => s.code === clean);
  if (found) return found;

  // Match by alias or exact name
  found = INDIAN_STATES.find(
    (s) => s.name.toUpperCase() === clean || s.aliases.includes(clean)
  );
  if (found) return found;

  // Match prefix
  found = INDIAN_STATES.find(
    (s) => s.name.toUpperCase().startsWith(clean) || s.aliases.some((a) => a.startsWith(clean))
  );
  return found || null;
}

/**
 * Search state matches for autocomplete suggestions when user types state name or code.
 */
export function searchStates(term) {
  if (!term || typeof term !== "string" || term.trim().length < 1) return [];
  const clean = term.trim().toUpperCase();
  
  const matches = INDIAN_STATES.filter((s) => {
    return (
      s.code.startsWith(clean) ||
      s.name.toUpperCase().includes(clean) ||
      s.aliases.some((a) => a.startsWith(clean))
    );
  });

  return matches.map((s) => ({
    name: s.name,
    type: "State",
    state: s.name,
    state_code: s.code,
    city: "",
    district: "",
    pincode: "",
  }));
}
