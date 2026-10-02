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
  Magnet,
  Grid,
  Box,
  Sliders,
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

/**
 * 4-Mode Controlled Micro Adjuster for Solar Designer:
 * MODE 1: ROW ADJUST
 * MODE 2: GROUP / STRUCTURE ADJUST
 * MODE 3: CUSTOM PANEL ADJUST (with Shift+Click multi-select and Snap ON/OFF)
 * MODE 4: STRUCTURE / MEMBER ADJUST
 */
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
  selectionMode = "row", // 'row' | 'group' | 'custom' | 'structure'
  setSelectionMode,
  selectedPanelId = null,
  setSelectedPanelId,
  selectedPanelIds = [],
  setSelectedPanelIds,
  selectedRowIndex = null,
  setSelectedRowIndex,
  selectedGroupId = null,
  setSelectedGroupId,
  structureMembers = [],
  setStructureMembers,
  structureNodes = [],
  setStructureNodes,
  selectedMemberId = null,
  setSelectedMemberId,
  autoLayoutBaselinePanels = null,
  hasManualAdjustments = false,
  setHasManualAdjustments,
  snapEnabled = true,
  setSnapEnabled,
}) {
  const [stepIncrement, setStepIncrement] = useState(0.05); // 0.02, 0.05, 0.10, 0.20
  const [activeRowTab, setActiveRowTab] = useState("move"); // 'move' | 'gap' | 'split'
  const [splitPanelIndex, setSplitPanelIndex] = useState(1);
  const [splitGap, setSplitGap] = useState(0.5);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Grouped rows
  const rows = useMemo(() => getPanelsByRow(panels), [panels]);

  // Selected row data
  const currentSelectedRow = useMemo(() => {
    if (selectedRowIndex == null) {
      return rows.length > 0 ? rows[0] : null;
    }
    return rows.find((r) => r.rowIndex === selectedRowIndex) || (rows.length > 0 ? rows[0] : null);
  }, [rows, selectedRowIndex]);

  // Selected group data
  const currentGroupId = selectedGroupId != null ? selectedGroupId : (currentSelectedRow ? currentSelectedRow.rowIndex : 0);
  const currentGroupPanels = useMemo(() => {
    return panels.filter((p) => (p.groupId != null ? p.groupId === currentGroupId : p.row === currentGroupId));
  }, [panels, currentGroupId]);

  // Multi-selected panels list
  const activeSelectedIds = useMemo(() => {
    if (selectedPanelIds && selectedPanelIds.length > 0) return selectedPanelIds;
    if (selectedPanelId) return [selectedPanelId];
    return [];
  }, [selectedPanelIds, selectedPanelId]);

  // Selected single panel
  const currentSelectedPanel = useMemo(() => {
    const id = activeSelectedIds[0] || selectedPanelId;
    if (!id) return null;
    return panels.find((p) => p.id === id) || null;
  }, [panels, activeSelectedIds, selectedPanelId]);

  // Sync initial row selection if in row mode
  useEffect(() => {
    if (selectionMode === "row" && selectedRowIndex == null && rows.length > 0) {
      setSelectedRowIndex?.(rows[0].rowIndex);
    }
  }, [selectionMode, selectedRowIndex, rows, setSelectedRowIndex]);

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

      // MODE 1: ROW MOVE
      if (selectionMode === "row") {
        if (!currentSelectedRow || currentSelectedRow.panels.length === 0) {
          toast.info("Please select a row to move.");
          return;
        }

        const rowPanelIds = new Set(currentSelectedRow.panels.map((p) => p.id));
        const candidatePanels = currentSelectedRow.panels.map((p) => ({
          ...p,
          x: Math.round((p.x + finalDx) * 1000) / 1000,
          y: Math.round((p.y + finalDy) * 1000) / 1000,
          isManual: true,
        }));

        const otherPanels = panels.filter((p) => !rowPanelIds.has(p.id));

        for (const cand of candidatePanels) {
          const validation = validatePanelPlacement({
            candidate: cand,
            roofPolygon,
            setbackMeters,
            panels: otherPanels,
            obstacles,
            walkways,
            excludePanelId: cand.id,
            isManual: true,
          });

          if (!validation.valid) {
            toast.warning(validation.reason || "Row movement would push panels outside roof boundary.");
            return;
          }
        }

        const candMap = new Map(candidatePanels.map((p) => [p.id, p]));
        setPanels((prev) =>
          prev.map((p) => {
            if (candMap.has(p.id)) {
              const updated = candMap.get(p.id);
              return { ...p, x: updated.x, y: updated.y, isManual: true };
            }
            return p;
          })
        );
        setHasManualAdjustments?.(true);
        return;
      }

      // MODE 2: GROUP / COMPLETE STRUCTURE MOVE
      if (selectionMode === "group") {
        if (currentGroupPanels.length === 0) {
          toast.info("Please select a structure group to move.");
          return;
        }

        const groupPanelIds = new Set(currentGroupPanels.map((p) => p.id));
        const candidatePanels = currentGroupPanels.map((p) => ({
          ...p,
          x: Math.round((p.x + finalDx) * 1000) / 1000,
          y: Math.round((p.y + finalDy) * 1000) / 1000,
          isManual: true,
        }));

        const otherPanels = panels.filter((p) => !groupPanelIds.has(p.id));

        for (const cand of candidatePanels) {
          const validation = validatePanelPlacement({
            candidate: cand,
            roofPolygon,
            setbackMeters,
            panels: otherPanels,
            obstacles,
            walkways,
            excludePanelId: cand.id,
            isManual: true,
          });

          if (!validation.valid) {
            toast.warning(validation.reason || "Group movement would push panels outside roof boundary.");
            return;
          }
        }

        const candMap = new Map(candidatePanels.map((p) => [p.id, p]));
        setPanels((prev) =>
          prev.map((p) => {
            if (candMap.has(p.id)) {
              const updated = candMap.get(p.id);
              return { ...p, x: updated.x, y: updated.y, isManual: true };
            }
            return p;
          })
        );

        // Also shift any custom structure members associated with this group
        if (structureMembers && structureMembers.length > 0 && setStructureMembers) {
          setStructureMembers((prev) =>
            prev.map((m) =>
              m.groupId === currentGroupId || m.row === currentGroupId
                ? { ...m, x: Math.round(((m.x || 0) + finalDx) * 1000) / 1000, y: Math.round(((m.y || 0) + finalDy) * 1000) / 1000 }
                : m
            )
          );
        }
        setHasManualAdjustments?.(true);
        return;
      }

      // MODE 3: CUSTOM PANEL ADJUST (Single or Multi-Selected Panels)
      if (selectionMode === "custom" || selectionMode === "panel") {
        if (activeSelectedIds.length === 0) {
          toast.info("Click panel to select (hold Shift to multi-select panels).");
          return;
        }

        const targetIdSet = new Set(activeSelectedIds);
        const movingPanels = panels.filter((p) => targetIdSet.has(p.id));
        const staticPanels = panels.filter((p) => !targetIdSet.has(p.id));

        const candidatePanels = movingPanels.map((p) => ({
          ...p,
          x: Math.round((p.x + finalDx) * 1000) / 1000,
          y: Math.round((p.y + finalDy) * 1000) / 1000,
          isManual: true,
        }));

        for (const cand of candidatePanels) {
          const validation = validatePanelPlacement({
            candidate: cand,
            roofPolygon,
            setbackMeters,
            panels: staticPanels, // Do not collide with other moving panels
            obstacles,
            walkways,
            excludePanelId: cand.id,
            isManual: true,
          });

          if (!validation.valid) {
            toast.warning(validation.reason || "Movement would push panels outside roof boundary.");
            return;
          }
        }

        const candMap = new Map(candidatePanels.map((p) => [p.id, p]));
        setPanels((prev) =>
          prev.map((p) => (candMap.has(p.id) ? { ...p, x: candMap.get(p.id).x, y: candMap.get(p.id).y, isManual: true } : p))
        );
        setHasManualAdjustments?.(true);
        return;
      }

      // MODE 4: STRUCTURE / MEMBER ADJUST
      if (selectionMode === "structure") {
        if (selectedMemberId && structureMembers.length > 0 && setStructureMembers) {
          setStructureMembers((prev) =>
            prev.map((m) =>
              m.id === selectedMemberId
                ? { ...m, x: Math.round(((m.x || 0) + finalDx) * 1000) / 1000, y: Math.round(((m.y || 0) + finalDy) * 1000) / 1000 }
                : m
            )
          );
          setHasManualAdjustments?.(true);
          toast.success("Shifted selected structure member");
        } else {
          toast.info("Please click a structure support post or rail to select it.");
        }
      }
    },
    [
      selectionMode,
      currentSelectedRow,
      currentGroupPanels,
      currentGroupId,
      activeSelectedIds,
      panels,
      roofPolygon,
      setbackMeters,
      obstacles,
      walkways,
      structureMembers,
      setPanels,
      setStructureMembers,
      setHasManualAdjustments,
      selectedMemberId,
    ]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW TILT ADJUSTMENT
  // ─────────────────────────────────────────────────────────────────────────────
  const handleAdjustRowTilt = (deltaDeg) => {
    if (!currentSelectedRow || currentSelectedRow.panels.length === 0) {
      toast.warning("Please select a row first.");
      return;
    }
    const rowPanelIds = new Set(currentSelectedRow.panels.map((p) => p.id));
    setPanels((prev) =>
      prev.map((p) => {
        if (rowPanelIds.has(p.id)) {
          const currentTilt = Number(p.tilt ?? 15);
          const newTilt = Math.max(0, Math.min(60, currentTilt + deltaDeg));
          return { ...p, tilt: newTilt, isManual: true };
        }
        return p;
      })
    );
    setHasManualAdjustments?.(true);
    toast.success(`Adjusted Row ${currentSelectedRow.visualIndex} tilt by ${deltaDeg > 0 ? `+${deltaDeg}` : deltaDeg}°`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CUSTOM PANEL ADD (Section & roof aware with isManual: true)
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
      isManual: true,
    });

    if (!check.canFit || !check.newPanel) {
      toast.warning(check.reason || "No valid spot available near the selected area.");
      return;
    }

    const added = { ...check.newPanel, isManual: true };
    setPanels((prev) => [...prev, added]);
    setSelectedPanelId?.(added.id);
    setSelectedPanelIds?.([added.id]);
    setHasManualAdjustments?.(true);
    toast.success("Added 1 panel in nearest valid roof position");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE SELECTED PANELS
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDeleteSelected = () => {
    if (activeSelectedIds.length === 0) {
      toast.warning("Please select panel(s) first.");
      return;
    }
    const removeSet = new Set(activeSelectedIds);
    setPanels((prev) => prev.filter((p) => !removeSet.has(p.id)));
    setSelectedPanelId?.(null);
    setSelectedPanelIds?.([]);
    setHasManualAdjustments?.(true);
    toast.success(`Removed ${activeSelectedIds.length} panel${activeSelectedIds.length === 1 ? "" : "s"}`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ROTATE SELECTION
  // ─────────────────────────────────────────────────────────────────────────────
  const handleRotateSelection = (deg = 15) => {
    if (activeSelectedIds.length === 0 && !currentSelectedRow) {
      toast.info("Please select panel(s) or a row first.");
      return;
    }
    const targetSet = new Set(
      selectionMode === "row" && currentSelectedRow
        ? currentSelectedRow.panels.map((p) => p.id)
        : activeSelectedIds
    );

    setPanels((prev) =>
      prev.map((p) =>
        targetSet.has(p.id)
          ? { ...p, rotation: ((Number(p.rotation) || 0) + deg) % 360, isManual: true }
          : p
      )
    );
    setHasManualAdjustments?.(true);
    toast.success(`Rotated selection by +${deg}°`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RESET LOCAL CHANGES
  // ─────────────────────────────────────────────────────────────────────────────
  const handleResetToAutoLayout = () => {
    if (!autoLayoutBaselinePanels || autoLayoutBaselinePanels.length === 0) {
      toast.info("No baseline auto-layout snapshot to restore.");
      return;
    }
    setPanels(autoLayoutBaselinePanels);
    setSelectedPanelId?.(null);
    setSelectedPanelIds?.([]);
    setSelectedRowIndex?.(null);
    setSelectedGroupId?.(null);
    setHasManualAdjustments?.(false);
    toast.success(`Restored auto-layout baseline (${autoLayoutBaselinePanels.length} panels)`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // KEYBOARD ARROW CONTROLS
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;

      const hasSelection =
        (selectionMode === "row" && currentSelectedRow) ||
        (selectionMode === "group" && currentGroupPanels.length > 0) ||
        ((selectionMode === "custom" || selectionMode === "panel") && activeSelectedIds.length > 0);

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
          if ((selectionMode === "custom" || selectionMode === "panel") && activeSelectedIds.length > 0) {
            e.preventDefault();
            handleDeleteSelected();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode, currentSelectedRow, currentGroupPanels, activeSelectedIds, stepIncrement, handleMicroMove]);

  const currentTilt = currentSelectedRow?.panels[0]?.tilt ?? 15;

  return (
    <div className="flex flex-col gap-2 bg-slate-900/98 border border-slate-800 px-3.5 py-2 rounded-2xl shadow-xl text-xs text-white shrink-0 select-none animate-in fade-in duration-150">
      {/* ── ROW 1: 4-MODE SELECTOR & CONTEXTUAL STATUS ────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>Micro Adjust:</span>
          </span>

          {/* 4 Clear Modes */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setSelectionMode?.("row");
                if (rows.length > 0 && selectedRowIndex == null) {
                  setSelectedRowIndex?.(rows[0].rowIndex);
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                selectionMode === "row" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>1. Row Adjust</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectionMode?.("group");
                setSelectedGroupId?.(currentSelectedRow ? currentSelectedRow.rowIndex : 0);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                selectionMode === "group" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Grid className="w-3 h-3" />
              <span>2. Group Adjust</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectionMode?.("custom")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                selectionMode === "custom" || selectionMode === "panel" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <MousePointer className="w-3 h-3" />
              <span>3. Custom Panel</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectionMode?.("structure")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                selectionMode === "structure" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Box className="w-3 h-3" />
              <span>4. Structure Adjust</span>
            </button>
          </div>
        </div>

        {/* Dynamic Contextual Feedback Badge */}
        <div className="flex items-center gap-2">
          <span className="text-amber-300 font-mono text-[11px] font-bold px-2.5 py-1 bg-amber-950/50 border border-amber-700/50 rounded-xl flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            {selectionMode === "row" && (
              currentSelectedRow
                ? `Selected: Row ${currentSelectedRow.visualIndex} (${currentSelectedRow.panels.length} Panels)`
                : "Click or select a row"
            )}
            {selectionMode === "group" && (
              `Selected: Structure Group ${currentGroupId + 1} (${currentGroupPanels.length} Panels + Rails)`
            )}
            {(selectionMode === "custom" || selectionMode === "panel") && (
              activeSelectedIds.length > 0
                ? `Selected: ${activeSelectedIds.length} Panel${activeSelectedIds.length === 1 ? "" : "s"} (Shift+Click multi-select)`
                : "Click panel to select (Shift+Click to multi-select)"
            )}
            {selectionMode === "structure" && (
              selectedMemberId ? `Selected: Member #${selectedMemberId.slice(-4)}` : "Click support post or rail to adjust"
            )}
          </span>

          {hasManualAdjustments && (
            <button
              type="button"
              onClick={handleResetToAutoLayout}
              className="h-7 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 text-[10.5px] font-semibold transition cursor-pointer"
              title="Restore auto-generation layout"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ── ROW 2: ACTIVE MODE DEDICATED CONTROLS ────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Direction D-Pad & Step Selector */}
        <div className="flex items-center gap-2">
          {/* Step Size Selector */}
          <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            {[0.02, 0.05, 0.1, 0.2].map((inc) => (
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

          {/* Directional Navigation Buttons: -X, +X, -Y, +Y */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleMicroMove(-stepIncrement, 0)}
              className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center gap-1 text-slate-200 hover:text-amber-300 font-mono font-bold text-xs transition shadow-sm cursor-pointer"
              title="Shift West / Left (-X)"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>← -X</span>
            </button>
            <button
              type="button"
              onClick={() => handleMicroMove(stepIncrement, 0)}
              className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center gap-1 text-slate-200 hover:text-amber-300 font-mono font-bold text-xs transition shadow-sm cursor-pointer"
              title="Shift East / Right (+X)"
            >
              <span>+X →</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => handleMicroMove(0, -stepIncrement)}
              className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center gap-1 text-slate-200 hover:text-amber-300 font-mono font-bold text-xs transition shadow-sm cursor-pointer"
              title="Shift South / Down (-Y)"
            >
              <ArrowDown className="w-3 h-3" />
              <span>↓ -Y</span>
            </button>
            <button
              type="button"
              onClick={() => handleMicroMove(0, stepIncrement)}
              className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 flex items-center gap-1 text-slate-200 hover:text-amber-300 font-mono font-bold text-xs transition shadow-sm cursor-pointer"
              title="Shift North / Up (+Y)"
            >
              <ArrowUp className="w-3 h-3" />
              <span>↑ +Y</span>
            </button>
          </div>
        </div>

        {/* Right: Mode Specific Tools */}
        <div className="flex items-center gap-2">
          {/* ── MODE 1: ROW ADJUST TOOLS ──────────────────────── */}
          {selectionMode === "row" && (
            <div className="flex items-center gap-2">
              {/* Row Tilt Control */}
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-xl">
                <span className="text-[10px] text-slate-400 font-semibold">Row Tilt:</span>
                <button
                  type="button"
                  onClick={() => handleAdjustRowTilt(-1)}
                  className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 hover:text-white"
                >
                  -
                </button>
                <span className="font-mono text-cyan-400 font-bold text-xs px-1">{currentTilt}°</span>
                <button
                  type="button"
                  onClick={() => handleAdjustRowTilt(1)}
                  className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 hover:text-white"
                >
                  +
                </button>
              </div>

              {/* Row Switcher (Prev / Next Row) */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (rows.length === 0) return;
                    const cIdx = rows.findIndex((r) => r.rowIndex === selectedRowIndex);
                    const prevIdx = cIdx > 0 ? cIdx - 1 : rows.length - 1;
                    setSelectedRowIndex?.(rows[prevIdx].rowIndex);
                  }}
                  className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Prev Row
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (rows.length === 0) return;
                    const cIdx = rows.findIndex((r) => r.rowIndex === selectedRowIndex);
                    const nextIdx = cIdx < rows.length - 1 ? cIdx + 1 : 0;
                    setSelectedRowIndex?.(rows[nextIdx].rowIndex);
                  }}
                  className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Next Row
                </button>
              </div>
            </div>
          )}

          {/* ── MODE 2: GROUP ADJUST TOOLS ────────────────────── */}
          {selectionMode === "group" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRotateSelection(15)}
                className="h-7 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 font-semibold text-xs"
              >
                <RotateCw className="w-3 h-3 text-cyan-400" />
                <span>Rotate Group 15°</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextGroupId = (currentGroupId + 1) % Math.max(1, rows.length);
                  setSelectedGroupId?.(nextGroupId);
                }}
                className="h-7 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 font-semibold text-xs"
              >
                <span>Next Table Group →</span>
              </button>
            </div>
          )}

          {/* ── MODE 3: CUSTOM PANEL ADJUST TOOLS ─────────────── */}
          {(selectionMode === "custom" || selectionMode === "panel") && (
            <div className="flex items-center gap-2">
              {/* SNAP TOGGLE */}
              <button
                type="button"
                onClick={() => setSnapEnabled?.(!snapEnabled)}
                className={`h-7 px-2.5 rounded-xl border flex items-center gap-1 font-bold text-xs transition cursor-pointer ${
                  snapEnabled
                    ? "bg-emerald-950/60 border-emerald-600/70 text-emerald-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                }`}
                title={snapEnabled ? "Snapping enabled to grid & panel gaps" : "Snapping disabled: free micro-positioning"}
              >
                <Magnet className="w-3.5 h-3.5" />
                <span>Snap {snapEnabled ? "ON" : "OFF"}</span>
              </button>

              {/* Add Single Panel Button */}
              <button
                type="button"
                onClick={handleAddSinglePanelNear}
                className="h-7 px-2.5 rounded-xl bg-amber-950/60 hover:bg-amber-900 border border-amber-700/60 text-amber-300 hover:text-white flex items-center gap-1 font-bold text-xs shadow-sm cursor-pointer"
                title="Add panel in nearest valid space"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Panel</span>
              </button>

              {/* Rotate Selection */}
              <button
                type="button"
                onClick={() => handleRotateSelection(15)}
                disabled={activeSelectedIds.length === 0}
                className="h-7 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 font-semibold text-xs"
                title="Rotate selected panel(s) 15°"
              >
                <RotateCw className="w-3 h-3 text-blue-400" />
                <span>Rotate</span>
              </button>

              {/* Delete Selection */}
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={activeSelectedIds.length === 0}
                className="h-7 px-2.5 rounded-xl bg-red-950/60 hover:bg-red-900 disabled:opacity-40 text-red-300 hover:text-white border border-red-800/60 flex items-center gap-1 font-semibold text-xs"
                title="Delete selected panel(s)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({activeSelectedIds.length})</span>
              </button>
            </div>
          )}

          {/* ── MODE 4: STRUCTURE ADJUST TOOLS ────────────────── */}
          {selectionMode === "structure" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 italic">
                Click support legs or rails in 3D to fine-tune placement & elevation.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
