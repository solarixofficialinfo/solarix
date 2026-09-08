/**
 * Canonical Unit Definitions and Normalization Utilities for Solarix
 *
 * Provides a single source of truth for:
 * - Display Names: "Nos", "Mtr", "Kg", "Set", "Pack", "Box", "Pair", "Ltr", "Pcs", "Roll", "Unit"
 * - Standard Codes: "NOS", "MTR", "KG", "SET", "PCK", "BOX", "PAIR", "LTR", "PCS", "ROLL", "UNIT"
 * - Variations / Aliases mapping for 100% backward compatibility
 */

export const STANDARDIZED_UNITS = [
  { code: "NOS", label: "Nos", aliases: ["nos", "no", "no.", "nos.", "number", "numbers", "n0s"] },
  { code: "MTR", label: "Mtr", aliases: ["mtr", "mtrs", "meter", "meters", "m", "metre", "metres"] },
  { code: "KG", label: "Kg", aliases: ["kg", "kgs", "kilogram", "kilograms"] },
  { code: "SET", label: "Set", aliases: ["set", "sets"] },
  { code: "PCK", label: "Pack", aliases: ["pck", "pack", "packs", "pkt", "pkts", "packet", "packets", "pkg", "pkgs"] },
  { code: "BOX", label: "Box", aliases: ["box", "boxes", "bx"] },
  { code: "PAIR", label: "Pair", aliases: ["pair", "pairs", "pr"] },
  { code: "LTR", label: "Ltr", aliases: ["ltr", "ltrs", "liter", "liters", "litre", "litres", "l"] },
  { code: "PCS", label: "Pcs", aliases: ["pcs", "piece", "pieces", "pc"] },
  { code: "ROLL", label: "Roll", aliases: ["roll", "rolls", "rl"] },
  { code: "UNIT", label: "Unit", aliases: ["unit", "units"] },
];

export const UNIT_OPTIONS = STANDARDIZED_UNITS.map((u) => u.label);

// Build fast lookup index
const ALIAS_TO_CODE = {};
const CODE_TO_LABEL = {};
const LABEL_TO_CODE = {};

STANDARDIZED_UNITS.forEach(({ code, label, aliases }) => {
  CODE_TO_LABEL[code] = label;
  LABEL_TO_CODE[label] = code;
  ALIAS_TO_CODE[code.toLowerCase()] = code;
  ALIAS_TO_CODE[label.toLowerCase()] = code;
  aliases.forEach((alias) => {
    ALIAS_TO_CODE[alias.toLowerCase()] = code;
  });
});

/**
 * Normalizes any unit string to its canonical standard code (e.g. "nos" -> "NOS", "Pack" -> "PCK")
 */
export function normalizeUnit(rawUnit) {
  if (!rawUnit) return "NOS";
  const trimmed = String(rawUnit).trim();
  const lower = trimmed.toLowerCase();
  if (ALIAS_TO_CODE[lower]) {
    return ALIAS_TO_CODE[lower];
  }
  // For unknown / custom units, return uppercase code
  return trimmed.toUpperCase();
}

/**
 * Formats any unit string into the clean UI display representation (e.g. "NOS" -> "Nos", "pck" -> "Pack")
 */
export function formatUnit(rawUnit) {
  if (!rawUnit) return "Nos";
  const trimmed = String(rawUnit).trim();
  const lower = trimmed.toLowerCase();
  const code = ALIAS_TO_CODE[lower];
  if (code && CODE_TO_LABEL[code]) {
    return CODE_TO_LABEL[code];
  }
  // Unknown unit: preserve original string safely
  return trimmed;
}

/**
 * Returns canonical unit info: { code, label }
 */
export function getUnitInfo(rawUnit) {
  return {
    code: normalizeUnit(rawUnit),
    label: formatUnit(rawUnit),
  };
}

/**
 * Returns options for dropdowns, ensuring existing non-standard value is preserved if present
 */
export function getStandardizedUnitOptions(currentValue) {
  const options = [...UNIT_OPTIONS];
  if (currentValue) {
    const formatted = formatUnit(currentValue);
    if (!options.includes(formatted)) {
      options.push(formatted);
    }
  }
  return options;
}
