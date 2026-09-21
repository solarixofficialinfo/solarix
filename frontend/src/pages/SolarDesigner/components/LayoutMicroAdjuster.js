import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  MousePointer,
  Move,
  Scissors,
  Copy,
  Trash2,
  RotateCcw,
  RotateCw,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Layers,
  Maximize2,
  ChevronDown,
  Sparkles,
  Info,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { validatePanelPlacement, canFitAdditionalPanel } from "../utils/layoutEngine";

/**
 * Helper to cluster and sort panels into rows
 */
export function getPanelsByRow(panels = []) {
  if (!Array.isArray(panels) || panels.length === 0) return [];

  // If every panel has an integer row, group by panel.row
  const allHaveRow = panels.every((p) => p.row !== undefined && p.row !== null);
  if (allHaveRow) {
    const rowMap = new Map();
    panels.forEach((p) => {
      if (!rowMap.has(p.row)) rowMap.set(p.row, []);
      rowMap.get(p.row).push(p);
    });

    // Sort rows North to South (descending Y)
    const sortedRows = Array.from(rowMap.entries()).sort((a, b) => {
      const avgYa = a[1].reduce((s, p) => s + p.y, 0) / a[1].length;
      const avgYb = b[1].reduce((s, p) => s + p.y, 0) / b[1].length;
      return avgYb - avgYa;
    });

    return sortedRows.map(([rowIndex, rowPanels], idx) => ({
      rowIndex,
      visualIndex: idx + 1,
      panels: [...rowPanels].sort((a, b) => a.x - b.x),
      avgY: rowPanels.reduce((s, p) => s + p.y, 0) / rowPanels.length,
    }));
  }

  // Fallback: Cluster panels by Y coordinate within tolerance
  const pHeight = panels[0]?.height || 2.278;
  const tolerance = pHeight * 0.45;
  const clusters = [];
  const sorted = [...panels].sort((a, b) => b.y - a.y);

  sorted.forEach((p) => {
    let matched = clusters.find((c) => Math.abs(c.avgY - p.y) <= tolerance);
    if (!matched) {
      matched = { rowIndex: clusters.length, panels: [], avgY: p.y };
      clusters.push(matched);
    }
    matched.panels.push(p);
    matched.avgY = matched.panels.reduce((s, item) => s + item.y, 0) / matched.panels.length;
  });

  return clusters.map((c, idx) => ({
    ...c,
    visualIndex: idx + 1,
    panels: [...c.panels].sort((a, b) => a.x - b.x),
  }));
}

export default function LayoutMicroAdjuster({
  variant = "fixed-bar",
  panels = [],
  setPanels,
  roofPolygon,
  setbackMeters = 0.5,
  obstacles = [],
  walkways = [],
  panelSpecs = {},
  orientation = "portrait",
  selectionMode = "panel", // 'panel' | 'row' | 'array'
  setSelectionMode,
  selectedPanelId = null,
  setSelectedPanelId,
  selectedRowIndex = null,
  setSelectedRowIndex,
  autoLayoutBaselinePanels = null,
  hasManualAdjustments = false,
  setHasManualAdjustments,
}) {
  const [stepIncrement, setStepIncrement] = useState(0.05); // 0.02, 0.05, 0.10, 0.20
  const [activeRowTab, setActiveRowTab] = useState("move"); // 'move' | 'gap' | 'split'
  const [splitPanelIndex, setSplitPanelIndex] = useState(1);
  const [splitGap, setSplitGap] = useState(0.5);
  const [customSplitGap, setCustomSplitGap] = useState("");
  const [customRowGap, setCustomRowGap] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Grouped rows
  const rows = useMemo(() => getPanelsByRow(panels), [panels]);

  // Selected row data
  const currentSelectedRow = useMemo(() => {
    if (selectedRowIndex == null) return null;
    return rows.find((r) => r.rowIndex === selectedRowIndex) || null;
  }, [rows, selectedRowIndex]);

  // Selected single panel data
  const currentSelectedPanel = useMemo(() => {
    if (!selectedPanelId) return null;
    return panels.find((p) => p.id === selectedPanelId) || null;
  }, [panels, selectedPanelId]);

  // Sync splitPanelIndex when selected row changes
  useEffect(() => {
    if (currentSelectedRow && currentSelectedRow.panels.length > 1) {
      setSplitPanelIndex(Math.floor(currentSelectedRow.panels.length / 2));
    }
  }, [currentSelectedRow]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MICRO MOVE HANDLER
  // ─────────────────────────────────────────────────────────────────────────────
  const handleMicroMove = useCallback(
    (dx, dy, multiplier = 1) => {
      const finalDx = Math.round(dx * multiplier * 1000) / 1000;
      const finalDy = Math.round(dy * multiplier * 1000) / 1000;
      if (!roofPolygon || roofPolygon.length < 3) {
        toast.warning("Roof boundary required for micro-adjustments.");
        return;
      }

      // CASE A: Single Panel Move
      if (selectionMode === "panel") {
        if (!selectedPanelId || !currentSelectedPanel) {
          toast.info("Please click a panel to select and move it.");
          return;
        }

        const candidate = {
          ...currentSelectedPanel,
          x: Math.round((currentSelectedPanel.x + finalDx) * 1000) / 1000,
          y: Math.round((currentSelectedPanel.y + finalDy) * 1000) / 1000,
        };

        const validation = validatePanelPlacement({
          candidate,
          roofPolygon,
          setbackMeters,
          panels,
          obstacles,
          walkways,
          excludePanelId: currentSelectedPanel.id,
        });

        if (!validation.valid) {
          toast.warning(validation.reason || "Panel would leave usable roof area.");
          return;
        }

        setPanels((prev) =>
          prev.map((p) => (p.id === currentSelectedPanel.id ? { ...p, x: candidate.x, y: candidate.y } : p))
        );
        setHasManualAdjustments?.(true);
        return;
      }

      // CASE B: Row Move
      if (selectionMode === "row") {
        if (selectedRowIndex == null || !currentSelectedRow) {
          toast.info("Please select a row to move.");
          return;
        }

        const rowPanelIds = new Set(currentSelectedRow.panels.map((p) => p.id));
        const candidatePanels = currentSelectedRow.panels.map((p) => ({
          ...p,
          x: Math.round((p.x + finalDx) * 1000) / 1000,
          y: Math.round((p.y + finalDy) * 1000) / 1000,
        }));

        const otherPanels = panels.filter((p) => !rowPanelIds.has(p.id));

        // Validate each panel in candidate row
        for (const cand of candidatePanels) {
          const validation = validatePanelPlacement({
            candidate: cand,
            roofPolygon,
            setbackMeters,
            panels: otherPanels,
            obstacles,
            walkways,
            excludePanelId: cand.id,
          });

          if (!validation.valid) {
            toast.warning(validation.reason || "Row movement would push panels outside usable roof area.");
            return;
          }
        }

        // Apply shift to row panels
        const candMap = new Map(candidatePanels.map((p) => [p.id, p]));
        setPanels((prev) =>
          prev.map((p) => {
            if (candMap.has(p.id)) {
              const updated = candMap.get(p.id);
              return { ...p, x: updated.x, y: updated.y };
            }
            return p;
          })
        );
        setHasManualAdjustments?.(true);
        return;
      }

      // CASE C: Entire Array Move
      if (selectionMode === "array") {
        if (panels.length === 0) return;

        const candidatePanels = panels.map((p) => ({
          ...p,
          x: Math.round((p.x + finalDx) * 1000) / 1000,
          y: Math.round((p.y + finalDy) * 1000) / 1000,
        }));

        for (const cand of candidatePanels) {
          const validation = validatePanelPlacement({
            candidate: cand,
            roofPolygon,
            setbackMeters,
            panels: [], // Skip intra-array collision during rigid translation
            obstacles,
            walkways,
            excludePanelId: cand.id,
          });

          if (!validation.valid) {
            toast.warning("Array movement would push panels outside usable roof area.");
            return;
          }
        }

        setPanels((prev) =>
          prev.map((p) => ({
            ...p,
            x: Math.round((p.x + finalDx) * 1000) / 1000,
            y: Math.round((p.y + finalDy) * 1000) / 1000,
          }))
        );
        setHasManualAdjustments?.(true);
      }
    },
    [
      selectionMode,
      selectedPanelId,
      currentSelectedPanel,
      selectedRowIndex,
      currentSelectedRow,
      panels,
      roofPolygon,
      setbackMeters,
      obstacles,
      walkways,
      setPanels,
      setHasManualAdjustments,
    ]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SINGLE PANEL DELETE HANDLER
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDeleteSelectedPanel = useCallback(() => {
    if (!selectedPanelId) {
      toast.warning("Please click a panel to select it first.");
      return;
    }

    setPanels((prev) => prev.filter((p) => p.id !== selectedPanelId));
    setSelectedPanelId(null);
    setHasManualAdjustments?.(true);
    toast.success("Deleted panel");
  }, [selectedPanelId, setPanels, setSelectedPanelId, setHasManualAdjustments]);

  // ─────────────────────────────────────────────────────────────────────────────
  // KEYBOARD SUPPORT (Arrow Keys & Shift Multiplier)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing inside input, textarea, or select
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }

      const hasSelection =
        (selectionMode === "panel" && selectedPanelId) ||
        (selectionMode === "row" && selectedRowIndex != null) ||
        selectionMode === "array";

      if (!hasSelection) return;

      const multiplier = e.shiftKey ? 5 : 1;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          handleMicroMove(0, stepIncrement, multiplier);
          break;
        case "ArrowDown":
          e.preventDefault();
          handleMicroMove(0, -stepIncrement, multiplier);
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleMicroMove(-stepIncrement, 0, multiplier);
          break;
        case "ArrowRight":
          e.preventDefault();
          handleMicroMove(stepIncrement, 0, multiplier);
          break;
        case "Delete":
        case "Backspace":
          if (selectionMode === "panel" && selectedPanelId) {
            e.preventDefault();
            handleDeleteSelectedPanel();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode, selectedPanelId, selectedRowIndex, stepIncrement, handleMicroMove, handleDeleteSelectedPanel]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW GAP TOOL HANDLER
  // ─────────────────────────────────────────────────────────────────────────────
  const handleApplyRowGap = (direction, gapValue) => {
    const gapM = Number(gapValue);
    if (isNaN(gapM) || gapM <= 0) {
      toast.warning("Please specify a valid gap distance (> 0m).");
      return;
    }

    if (selectedRowIndex == null || !currentSelectedRow) {
      toast.warning("Please select a row first.");
      return;
    }

    // Identify row order
    const sortedVisualRows = [...rows].sort((a, b) => b.avgY - a.avgY); // Top to bottom (descending Y)
    const currentIdx = sortedVisualRows.findIndex((r) => r.rowIndex === selectedRowIndex);
    if (currentIdx === -1) return;

    // Direction:
    // 'before': Move current row and all subsequent rows DOWN (-Y) away from row above
    // 'after': Move all subsequent rows DOWN (-Y) away from current row
    let rowsToShift = [];
    if (direction === "before") {
      rowsToShift = sortedVisualRows.slice(currentIdx);
    } else {
      rowsToShift = sortedVisualRows.slice(currentIdx + 1);
    }

    if (rowsToShift.length === 0) {
      toast.info(direction === "before" ? "This is the topmost row." : "This is the bottommost row.");
      return;
    }

    const shiftPanelIds = new Set(rowsToShift.flatMap((r) => r.panels.map((p) => p.id)));
    const unshiftedPanels = panels.filter((p) => !shiftPanelIds.has(p.id));

    // Calculate candidate shifted panels (moving South = -Y)
    const candidatePanels = panels
      .filter((p) => shiftPanelIds.has(p.id))
      .map((p) => ({
        ...p,
        y: Math.round((p.y - gapM) * 1000) / 1000,
      }));

    // Validate candidates
    for (const cand of candidatePanels) {
      const validation = validatePanelPlacement({
        candidate: cand,
        roofPolygon,
        setbackMeters,
        panels: unshiftedPanels,
        obstacles,
        walkways,
        excludePanelId: cand.id,
      });

      if (!validation.valid) {
        toast.warning(validation.reason || "Row gap would push panels outside usable roof area.");
        return;
      }
    }

    // Apply shift
    const candMap = new Map(candidatePanels.map((p) => [p.id, p]));
    setPanels((prev) =>
      prev.map((p) => (candMap.has(p.id) ? { ...p, y: candMap.get(p.id).y } : p))
    );
    setHasManualAdjustments?.(true);
    toast.success(`Applied +${gapM.toFixed(2)}m row gap (${direction === "before" ? "Gap Before" : "Gap After"})`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SPLIT ROW HANDLER
  // ─────────────────────────────────────────────────────────────────────────────
  const handleApplySplitRow = (gapValue) => {
    const gapM = Number(gapValue);
    if (isNaN(gapM) || gapM <= 0) {
      toast.warning("Please specify a valid split gap distance.");
      return;
    }

    if (!currentSelectedRow || currentSelectedRow.panels.length < 2) {
      toast.warning("Selected row must have at least 2 panels to split.");
      return;
    }

    const sortedPanels = currentSelectedRow.panels; // Left to right
    if (splitPanelIndex < 1 || splitPanelIndex >= sortedPanels.length) {
      toast.warning(`Split index must be between 1 and ${sortedPanels.length - 1}`);
      return;
    }

    // Panels after the split index get shifted right (+X)
    const trailingPanels = sortedPanels.slice(splitPanelIndex);
    const trailingIds = new Set(trailingPanels.map((p) => p.id));
    const stationaryPanels = panels.filter((p) => !trailingIds.has(p.id));

    const candidateTrailing = trailingPanels.map((p) => ({
      ...p,
      x: Math.round((p.x + gapM) * 1000) / 1000,
    }));

    // Validate trailing panels
    for (const cand of candidateTrailing) {
      const validation = validatePanelPlacement({
        candidate: cand,
        roofPolygon,
        setbackMeters,
        panels: stationaryPanels,
        obstacles,
        walkways,
        excludePanelId: cand.id,
      });

      if (!validation.valid) {
        toast.warning(validation.reason || "Split gap would push panels outside usable roof area.");
        return;
      }
    }

    // Apply shift
    const candMap = new Map(candidateTrailing.map((p) => [p.id, p]));
    setPanels((prev) =>
      prev.map((p) => (candMap.has(p.id) ? { ...p, x: candMap.get(p.id).x } : p))
    );
    setHasManualAdjustments?.(true);
    toast.success(`Split row after panel #${splitPanelIndex} with +${gapM.toFixed(2)}m gap`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // DUPLICATE ROW HANDLER
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDuplicateRow = () => {
    if (!currentSelectedRow || currentSelectedRow.panels.length === 0) {
      toast.warning("Please select a row to duplicate.");
      return;
    }

    const refPanel = currentSelectedRow.panels[0];
    const pLength = Number(refPanel.height || 2.278);
    const rowGap = 0.05;
    const dyOffset = -(pLength + rowGap); // Place adjacent below

    const newRowIndex = Math.max(...panels.map((p) => p.row || 0), 0) + 1;
    const timestamp = Date.now();

    const duplicatedPanels = currentSelectedRow.panels.map((p, idx) => ({
      ...p,
      id: `panel-dup-${timestamp}-${idx}`,
      row: newRowIndex,
      y: Math.round((p.y + dyOffset) * 1000) / 1000,
    }));

    // Validate every duplicated panel
    for (const cand of duplicatedPanels) {
      const validation = validatePanelPlacement({
        candidate: cand,
        roofPolygon,
        setbackMeters,
        panels,
        obstacles,
        walkways,
        excludePanelId: null,
      });

      if (!validation.valid) {
        toast.warning("Cannot duplicate row: insufficient usable space adjacent to row.");
        return;
      }
    }

    setPanels((prev) => [...prev, ...duplicatedPanels]);
    setSelectedRowIndex(newRowIndex);
    setHasManualAdjustments?.(true);
    toast.success(`Duplicated row (${duplicatedPanels.length} panels added)`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE ROW HANDLER
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDeleteSelectedRow = () => {
    if (selectedRowIndex == null || !currentSelectedRow) {
      toast.warning("Please select a row to delete.");
      return;
    }

    const count = currentSelectedRow.panels.length;
    const rowIds = new Set(currentSelectedRow.panels.map((p) => p.id));
    setPanels((prev) => prev.filter((p) => !rowIds.has(p.id)));
    setSelectedRowIndex(null);
    setHasManualAdjustments?.(true);
    toast.success(`Deleted row (${count} panels removed)`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SINGLE PANEL ADD
  // ─────────────────────────────────────────────────────────────────────────────
  const handleAddSinglePanelNear = () => {
    if (!roofPolygon || roofPolygon.length < 3) {
      toast.warning("Please define a roof boundary first.");
      return;
    }

    const targetX = currentSelectedPanel?.x ?? currentSelectedRow?.panels[0]?.x ?? null;
    const targetY = currentSelectedPanel?.y ?? currentSelectedRow?.panels[0]?.y ?? null;

    const check = canFitAdditionalPanel({
      panels,
      roofPolygon,
      setbackMeters,
      obstacles,
      walkways,
      panelSpecs: {
        length_m: panelSpecs.length_m || 2.278,
        width_m: panelSpecs.width_m || 1.134,
        wattage: panelSpecs.wattage || 550,
      },
      orientation,
      nearX: targetX,
      nearY: targetY,
    });

    if (!check.canFit || !check.newPanel) {
      toast.warning(check.reason || "No valid spot available near the selected area.");
      return;
    }

    setPanels((prev) => [...prev, check.newPanel]);
    setSelectedPanelId(check.newPanel.id);
    setHasManualAdjustments?.(true);
    toast.success("Added 1 panel near selected area");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RESET LOCAL CHANGES
  // ─────────────────────────────────────────────────────────────────────────────
  const handleResetLocal = () => {
    if (!autoLayoutBaselinePanels || autoLayoutBaselinePanels.length === 0) {
      toast.info("No baseline auto-layout snapshot to restore.");
      return;
    }

    setPanels(autoLayoutBaselinePanels);
    setSelectedPanelId(null);
    setSelectedRowIndex(null);
    setHasManualAdjustments?.(false);
    toast.success(`Restored auto-layout (${autoLayoutBaselinePanels.length} panels)`);
  };

  if (variant === "fixed-bar") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/95 border border-slate-800 px-3.5 py-1.5 rounded-2xl shadow-md text-xs text-white shrink-0">
        {/* 1. SELECTION TARGET */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <MousePointer className="w-3.5 h-3.5 text-amber-400" />
            <span>Selection:</span>
          </span>
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setSelectionMode?.("panel");
                setSelectedRowIndex?.(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                selectionMode === "panel" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Panel</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectionMode?.("row");
                setSelectedPanelId?.(null);
                if (rows.length > 0 && selectedRowIndex == null) {
                  setSelectedRowIndex?.(rows[0].rowIndex);
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                selectionMode === "row" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Row</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectionMode?.("array");
                setSelectedPanelId?.(null);
                setSelectedRowIndex?.(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                selectionMode === "array" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Array</span>
            </button>
          </div>

          {/* Current target info tag */}
          <span className="text-amber-300 font-mono text-[11px] font-semibold px-2.5 py-1 bg-amber-950/40 border border-amber-800/40 rounded-xl">
            {selectionMode === "panel"
              ? currentSelectedPanel
                ? `Panel #${panels.findIndex((p) => p.id === selectedPanelId) + 1}`
                : "Click a panel"
              : selectionMode === "row"
              ? currentSelectedRow
                ? `Row ${currentSelectedRow.visualIndex} (${currentSelectedRow.panels.length}p)`
                : "Click a row"
              : `Array (${panels.length}p)`}
          </span>
        </div>

        {/* 2. MICRO ADJUST CONTROLS */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Move className="w-3.5 h-3.5 text-amber-400" />
            <span>Micro Adjust:</span>
          </span>
          {/* Step increment pills */}
          <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            {[0.02, 0.05, 0.1].map((inc) => (
              <button
                key={inc}
                type="button"
                onClick={() => setStepIncrement(inc)}
                className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition cursor-pointer ${
                  stepIncrement === inc ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                }`}
              >
                {inc.toFixed(2)}m
              </button>
            ))}
          </div>

          {/* Direction buttons: -X, +X, -Y, +Y */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleMicroMove(-stepIncrement, 0)}
              className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center gap-1 text-slate-200 hover:text-amber-300 font-mono font-bold text-xs transition shadow-sm cursor-pointer"
              title="Move Left (-X)"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>-X</span>
            </button>
            <button
              type="button"
              onClick={() => handleMicroMove(stepIncrement, 0)}
              className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center gap-1 text-slate-200 hover:text-amber-300 font-mono font-bold text-xs transition shadow-sm cursor-pointer"
              title="Move Right (+X)"
            >
              <span>+X</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => handleMicroMove(0, -stepIncrement)}
              className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center gap-1 text-slate-200 hover:text-amber-300 font-mono font-bold text-xs transition shadow-sm cursor-pointer"
              title="Move Down (-Y)"
            >
              <ArrowDown className="w-3 h-3" />
              <span>-Y</span>
            </button>
            <button
              type="button"
              onClick={() => handleMicroMove(0, stepIncrement)}
              className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center gap-1 text-slate-200 hover:text-amber-300 font-mono font-bold text-xs transition shadow-sm cursor-pointer"
              title="Move Up (+Y)"
            >
              <ArrowUp className="w-3 h-3" />
              <span>+Y</span>
            </button>
          </div>
        </div>

        {/* 3. ROTATE, RESET, DELETE */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleRotateSelection(15)}
            className="h-7 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1.5 font-semibold text-xs transition cursor-pointer"
            title="Rotate +15°"
          >
            <RotateCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Rotate 15°</span>
          </button>

          {hasManualAdjustments && (
            <button
              type="button"
              onClick={handleResetToAutoLayout}
              className="h-7 px-2.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 hover:text-white border border-amber-800/60 flex items-center gap-1 font-semibold text-xs transition cursor-pointer"
              title="Restore original auto-layout baseline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

          {selectionMode === "panel" && selectedPanelId && (
            <button
              type="button"
              onClick={handleDeleteSelectedPanel}
              className="h-7 px-2.5 rounded-xl bg-red-950/60 hover:bg-red-900 text-red-300 hover:text-white border border-red-800/60 flex items-center gap-1 font-semibold text-xs transition cursor-pointer"
              title="Delete selected panel"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-4 right-4 z-30 flex flex-col bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl text-white text-xs w-72 overflow-hidden transition-all select-none"
      style={{ maxHeight: isCollapsed ? "42px" : "560px" }}
    >
      {/* ── HEADER & COLLAPSE ────────────────────────────────────────── */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-3.5 py-2.5 bg-slate-800/80 border-b border-slate-700/80 cursor-pointer hover:bg-slate-800 transition"
      >
        <div className="flex items-center gap-2">
          <Move className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-extrabold text-[12px] tracking-tight">Micro-Adjustment</span>
          {hasManualAdjustments && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-500/30">
              Modified
            </span>
          )}
        </div>
        <button
          type="button"
          className="text-slate-400 hover:text-white transition p-0.5"
          title={isCollapsed ? "Expand panel" : "Collapse panel"}
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
          />
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-3 space-y-3 overflow-y-auto max-h-[500px]">
          {/* ── 1. SELECTION CONTROLS ───────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span>Selection Target</span>
              <span className="text-amber-300 font-mono text-[10px]">
                {selectionMode === "panel"
                  ? currentSelectedPanel
                    ? `Panel #${panels.findIndex((p) => p.id === selectedPanelId) + 1}`
                    : "None selected"
                  : selectionMode === "row"
                  ? currentSelectedRow
                    ? `Row ${currentSelectedRow.visualIndex} (${currentSelectedRow.panels.length}p)`
                    : "None selected"
                  : `Array (${panels.length}p)`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-950/80 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setSelectionMode("panel");
                  setSelectedRowIndex(null);
                }}
                className={`py-1 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center justify-center gap-1 ${
                  selectionMode === "panel"
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <MousePointer className="w-3 h-3" />
                <span>Panel</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectionMode("row");
                  setSelectedPanelId(null);
                  if (rows.length > 0 && selectedRowIndex == null) {
                    setSelectedRowIndex(rows[0].rowIndex);
                  }
                }}
                className={`py-1 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center justify-center gap-1 ${
                  selectionMode === "row"
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Row</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectionMode("array");
                  setSelectedPanelId(null);
                  setSelectedRowIndex(null);
                }}
                className={`py-1 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center justify-center gap-1 ${
                  selectionMode === "array"
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Maximize2 className="w-3 h-3" />
                <span>Array</span>
              </button>
            </div>
          </div>

          {/* ── 2. MICRO MOVE D-PAD ──────────────────────────────────────── */}
          <div className="space-y-2 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Micro Move (Plane)
              </span>
              {/* Increment Pills */}
              <div className="flex items-center gap-0.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                {[0.02, 0.05, 0.1, 0.2].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => setStepIncrement(inc)}
                    className={`px-1.5 py-0.5 text-[9.5px] font-mono font-bold rounded transition cursor-pointer ${
                      stepIncrement === inc
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {inc.toFixed(2)}m
                  </button>
                ))}
              </div>
            </div>

            {/* Directional 4-Way Pad */}
            <div className="flex flex-col items-center justify-center py-1">
              <button
                type="button"
                onClick={() => handleMicroMove(0, stepIncrement)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center justify-center text-slate-200 hover:text-amber-300 transition shadow-sm cursor-pointer"
                title="Move Up (+Y)"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-4 my-1">
                <button
                  type="button"
                  onClick={() => handleMicroMove(-stepIncrement, 0)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center justify-center text-slate-200 hover:text-amber-300 transition shadow-sm cursor-pointer"
                  title="Move Left (-X)"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-4 h-4 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </div>
                <button
                  type="button"
                  onClick={() => handleMicroMove(stepIncrement, 0)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center justify-center text-slate-200 hover:text-amber-300 transition shadow-sm cursor-pointer"
                  title="Move Right (+X)"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleMicroMove(0, -stepIncrement)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center justify-center text-slate-200 hover:text-amber-300 transition shadow-sm cursor-pointer"
                title="Move Down (-Y)"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center text-[9.5px] text-slate-500 font-medium">
              Keyboard: <span className="text-slate-300 font-bold">Arrow Keys</span> • Shift:{" "}
              <span className="text-amber-300 font-bold">5× ({(stepIncrement * 5).toFixed(2)}m)</span>
            </div>
          </div>

          {/* ── 3. ROW-SPECIFIC TOOLS (Row Gap, Split, Duplicate, Delete) ─ */}
          {selectionMode === "row" && currentSelectedRow && (
            <div className="space-y-2 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[10px] text-slate-300 font-bold uppercase">
                  Row {currentSelectedRow.visualIndex} Tools
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {currentSelectedRow.panels.length} panels
                </span>
              </div>

              {/* Sub-tab navigation */}
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-900 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveRowTab("gap")}
                  className={`py-1 rounded text-[10.5px] font-bold transition cursor-pointer ${
                    activeRowTab === "gap" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Row Gap
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRowTab("split")}
                  className={`py-1 rounded text-[10.5px] font-bold transition cursor-pointer ${
                    activeRowTab === "split" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Split Row
                </button>
              </div>

              {/* ROW GAP CONTROLS */}
              {activeRowTab === "gap" && (
                <div className="space-y-2 pt-1">
                  <div className="text-[10px] text-slate-400">Add spacing relative to adjacent row:</div>
                  <div className="grid grid-cols-4 gap-1">
                    {[0.05, 0.1, 0.2, 0.5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleApplyRowGap("before", val)}
                        className="py-1 px-1 text-[9.5px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 transition cursor-pointer text-center"
                        title={`Increase gap before by +${val}m`}
                      >
                        +{val}m
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="number"
                      step="0.05"
                      min="0.01"
                      max="3.0"
                      value={customRowGap}
                      onChange={(e) => setCustomRowGap(e.target.value)}
                      placeholder="Custom m"
                      className="w-24 h-6 px-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleApplyRowGap("before", parseFloat(customRowGap))}
                      disabled={!customRowGap}
                      className="flex-1 h-6 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded transition cursor-pointer"
                    >
                      Gap Before
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyRowGap("after", parseFloat(customRowGap))}
                      disabled={!customRowGap}
                      className="flex-1 h-6 text-[10px] font-bold bg-blue-700 hover:bg-blue-600 disabled:opacity-30 text-white rounded transition cursor-pointer"
                    >
                      Gap After
                    </button>
                  </div>
                </div>
              )}

              {/* SPLIT ROW CONTROLS */}
              {activeRowTab === "split" && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Split after panel:</span>
                    <span className="font-mono text-amber-300 font-bold">#{splitPanelIndex}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max={Math.max(1, currentSelectedRow.panels.length - 1)}
                    value={splitPanelIndex}
                    onChange={(e) => setSplitPanelIndex(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />

                  <div className="text-[10px] text-slate-400">Split Gap:</div>
                  <div className="grid grid-cols-3 gap-1">
                    {[0.2, 0.5, 0.75].map((gap) => (
                      <button
                        key={gap}
                        type="button"
                        onClick={() => handleApplySplitRow(gap)}
                        className="py-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 transition cursor-pointer text-center"
                      >
                        {gap}m
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="3.0"
                      value={customSplitGap}
                      onChange={(e) => setCustomSplitGap(e.target.value)}
                      placeholder="Custom m"
                      className="w-24 h-6 px-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleApplySplitRow(parseFloat(customSplitGap))}
                      disabled={!customSplitGap}
                      className="flex-1 h-6 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded transition cursor-pointer"
                    >
                      Apply Split
                    </button>
                  </div>
                </div>
              )}

              {/* ROW ACTIONS: Duplicate & Delete */}
              <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={handleDuplicateRow}
                  className="h-6 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <Copy className="w-3 h-3 text-cyan-400" />
                  <span>Duplicate Row</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelectedRow}
                  className="h-6 text-[10px] font-bold bg-red-950/40 hover:bg-red-900/60 text-red-300 rounded border border-red-800/50 flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                  <span>Delete Row</span>
                </button>
              </div>
            </div>
          )}

          {/* ── 4. SINGLE PANEL ACTIONS ─────────────────────────────────── */}
          {selectionMode === "panel" && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAddSinglePanelNear}
                className="flex-1 h-7 text-[11px] font-bold bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg flex items-center justify-center gap-1 transition shadow-sm cursor-pointer"
                title="Add 1 panel near selected position"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Panel</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteSelectedPanel}
                disabled={!selectedPanelId}
                className="flex-1 h-7 text-[11px] font-bold bg-red-950/50 hover:bg-red-900/70 border border-red-800/60 text-red-300 disabled:opacity-30 rounded-lg flex items-center justify-center gap-1 transition shadow-sm cursor-pointer"
                title="Delete selected panel"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Delete Panel</span>
              </button>
            </div>
          )}

          {/* ── 5. RESET LOCAL CHANGES ──────────────────────────────────── */}
          {hasManualAdjustments && (
            <button
              type="button"
              onClick={handleResetLocal}
              className="w-full h-7 text-[10.5px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-600/40 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="Revert all manual edits back to the latest Auto Layout"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span>Reset Local Changes</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
