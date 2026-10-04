import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  MousePointer,
  Move,
  Trash2,
  RotateCcw,
  RotateCw,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Layers,
  Magnet,
  Grid,
  Box,
  Sliders,
  Crosshair,
  Rotate3d,
} from "lucide-react";
import { toast } from "sonner";
import { validatePanelPlacement, canFitAdditionalPanel } from "../utils/layoutEngine";
import { isPointInPolygon } from "../utils/geoCalculations";

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
 * Flow:
 * 1. CLICK MICRO ADJUST -> SHOW MODE SELECTION [ ROW ] [ GROUP ] [ PANEL ] [ STRUCTURE ]
 * 2. USER SELECTS ONE MODE -> ONLY THEN SHOW CONTROLS FOR THAT MODE
 * 3. Specialized controls per mode:
 *    - ROW: Three-state shift (LEFT / CENTER / RIGHT), fine shift, tilt, row select
 *    - GROUP: Group shift, rotate, elevation
 *    - PANEL: Add panel (manual override), multi-panel shift, rotate, delete, snap
 *    - STRUCTURE: Member fine adjustment
 */
export default function LayoutMicroAdjuster({
  variant = "fixed-bar",
  panels = [],
  setPanels,
  roofPolygon,
  activeSection = null,
  roofSections = [],
  setbackMeters = 0.5,
  obstacles = [],
  walkways = [],
  panelSpecs = {},
  orientation = "portrait",
  selectionMode = null, // null | 'row' | 'group' | 'panel' | 'structure'
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
  setActiveTool,
  onClose,
  recommendedCapacity = null,
  onAddManualPanel,
}) {
  const [stepIncrement, setStepIncrement] = useState(0.05); // 0.02, 0.05, 0.10, 0.20
  const rowBaselinesRef = useRef(new Map());

  // Section Isolation: Filter panels for this section if activeSection is given
  const effectivePanels = useMemo(() => {
    if (!activeSection) return panels;
    return panels.filter(
      (p) =>
        p.sectionId === activeSection.id ||
        (!p.sectionId && activeSection.polygon && isPointInPolygon(p.x, p.y, activeSection.polygon))
    );
  }, [panels, activeSection]);

  const targetBoundaryPolygon = activeSection?.polygon || roofPolygon;

  // Grouped rows
  const rows = useMemo(() => getPanelsByRow(effectivePanels), [effectivePanels]);

  // Record initial row average X on first observation for Center/Reset
  useEffect(() => {
    rows.forEach((r) => {
      if (!rowBaselinesRef.current.has(r.rowIndex) && r.panels.length > 0) {
        const avgX = r.panels.reduce((sum, p) => sum + p.x, 0) / r.panels.length;
        rowBaselinesRef.current.set(r.rowIndex, avgX);
      }
    });
  }, [rows]);

  // Selected row data
  const currentSelectedRow = useMemo(() => {
    if (selectedRowIndex == null) {
      return rows.length > 0 ? rows[0] : null;
    }
    return rows.find((r) => r.rowIndex === selectedRowIndex) || (rows.length > 0 ? rows[0] : null);
  }, [rows, selectedRowIndex]);

  // Selected group data
  const currentGroupId =
    selectedGroupId != null ? selectedGroupId : currentSelectedRow ? currentSelectedRow.rowIndex : 0;
  const currentGroupPanels = useMemo(() => {
    return effectivePanels.filter((p) =>
      p.groupId != null ? p.groupId === currentGroupId : p.row === currentGroupId
    );
  }, [effectivePanels, currentGroupId]);

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
      if (!targetBoundaryPolygon || targetBoundaryPolygon.length < 3) {
        toast.warning("Roof boundary required for micro-adjustments.");
        return;
      }

      // MODE 1: ROW MOVE (Entire selected row moves as ONE logical group)
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
            roofPolygon: targetBoundaryPolygon,
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

      // MODE 2: GROUP MOVE
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
            roofPolygon: targetBoundaryPolygon,
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

        if (structureMembers && structureMembers.length > 0 && setStructureMembers) {
          setStructureMembers((prev) =>
            prev.map((m) =>
              m.groupId === currentGroupId || m.row === currentGroupId
                ? {
                    ...m,
                    x: Math.round(((m.x || 0) + finalDx) * 1000) / 1000,
                    y: Math.round(((m.y || 0) + finalDy) * 1000) / 1000,
                  }
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
            roofPolygon: targetBoundaryPolygon,
            setbackMeters,
            panels: staticPanels,
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
          prev.map((p) =>
            candMap.has(p.id) ? { ...p, x: candMap.get(p.id).x, y: candMap.get(p.id).y, isManual: true } : p
          )
        );
        setHasManualAdjustments?.(true);
        return;
      }

      // MODE 4: STRUCTURE ADJUST
      if (selectionMode === "structure") {
        if (selectedMemberId && structureMembers.length > 0 && setStructureMembers) {
          setStructureMembers((prev) =>
            prev.map((m) =>
              m.id === selectedMemberId
                ? {
                    ...m,
                    x: Math.round(((m.x || 0) + finalDx) * 1000) / 1000,
                    y: Math.round(((m.y || 0) + finalDy) * 1000) / 1000,
                  }
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
      targetBoundaryPolygon,
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
  // THREE-STATE ROW SHIFT: LEFT, CENTER / RESET, RIGHT
  // ─────────────────────────────────────────────────────────────────────────────
  const handleShiftRowLeft = () => {
    const shiftAmt = Math.max(0.1, stepIncrement * 2);
    handleMicroMove(-shiftAmt, 0);
  };

  const handleShiftRowRight = () => {
    const shiftAmt = Math.max(0.1, stepIncrement * 2);
    handleMicroMove(shiftAmt, 0);
  };

  const handleResetRowCenter = () => {
    if (!currentSelectedRow || currentSelectedRow.panels.length === 0) {
      toast.info("Please select a row first.");
      return;
    }
    const baselineAvgX = rowBaselinesRef.current.get(currentSelectedRow.rowIndex);
    const currentAvgX =
      currentSelectedRow.panels.reduce((sum, p) => sum + p.x, 0) / currentSelectedRow.panels.length;
    if (baselineAvgX == null) {
      toast.info("Row is already at baseline center.");
      return;
    }
    const deltaX = Math.round((baselineAvgX - currentAvgX) * 1000) / 1000;
    if (Math.abs(deltaX) < 0.005) {
      toast.info("Row is already centered.");
      return;
    }
    handleMicroMove(deltaX, 0);
    toast.success(`Row ${currentSelectedRow.visualIndex} reset to center`);
  };

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
  // CUSTOM PANEL ADD (MANUAL OVERRIDE: Capacity recommendation is never a hard block)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleAddSinglePanelNear = () => {
    if (onAddManualPanel) {
      onAddManualPanel();
      return;
    }

    if (!targetBoundaryPolygon || targetBoundaryPolygon.length < 3) {
      toast.warning("Please define a roof boundary first.");
      return;
    }

    const targetX = currentSelectedPanel?.x ?? currentSelectedRow?.panels[0]?.x ?? null;
    const targetY = currentSelectedPanel?.y ?? currentSelectedRow?.panels[0]?.y ?? null;

    const check = canFitAdditionalPanel({
      panels,
      roofPolygon: targetBoundaryPolygon,
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
      toast.warning(check.reason || "Unable to place panel.");
      return;
    }

    const added = {
      ...check.newPanel,
      sectionId: activeSection ? activeSection.id : undefined,
      isManual: true,
    };
    setPanels((prev) => [...prev, added]);
    setSelectedPanelId?.(added.id);
    setSelectedPanelIds?.([added.id]);
    setHasManualAdjustments?.(true);
    toast.success(`Manually added Panel #${panels.length + 1} (Override: ON)`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE SELECTED PANELS
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDeleteSelected = useCallback(() => {
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
  }, [activeSelectedIds, setPanels, setSelectedPanelId, setSelectedPanelIds, setHasManualAdjustments]);

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
  // KEYBOARD ARROW SHORTCUTS
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
      const multiplier = e.shiftKey ? 4 : 1;

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
  }, [selectionMode, currentSelectedRow, currentGroupPanels, activeSelectedIds, stepIncrement, handleMicroMove, handleDeleteSelected]);

  const currentTilt = currentSelectedRow?.panels[0]?.tilt ?? 15;
  const isPanelMode = selectionMode === "custom" || selectionMode === "panel";

  // Comparison metrics for manual override
  const baselineCount = recommendedCapacity != null ? recommendedCapacity : autoLayoutBaselinePanels?.length || panels.length;
  const isOverridden = panels.length > baselineCount;

  // ═════════════════════════════════════════════════════════════════════════════
  // VIEW 1: MODE SELECTION SCREEN (Shown when user opens Micro Adjust)
  // ═════════════════════════════════════════════════════════════════════════════
  if (!selectionMode) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/98 border border-amber-500/40 px-4 py-2.5 rounded-2xl shadow-2xl text-xs text-white shrink-0 select-none animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
            <Sliders className="w-4 h-4" />
          </span>
          <div>
            <div className="text-xs font-bold text-white tracking-wide uppercase flex items-center gap-2">
              <span>Micro Adjust</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700/60 text-amber-300 font-mono">
                Select Mode
              </span>
              {activeSection && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono">
                  {activeSection.name || "Section"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">Choose an adjustment tool to show specialized controls:</p>
          </div>
        </div>

        {/* 4 Clear Mode Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setSelectionMode?.("row");
              if (rows.length > 0) setSelectedRowIndex?.(rows[0].rowIndex);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 bg-slate-800/90 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-700 hover:border-amber-400 shadow-sm"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>1. ROW</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectionMode?.("group");
              setSelectedGroupId?.(currentSelectedRow ? currentSelectedRow.rowIndex : 0);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 bg-slate-800/90 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-700 hover:border-amber-400 shadow-sm"
          >
            <Grid className="w-3.5 h-3.5 text-amber-400" />
            <span>2. GROUP</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectionMode?.("panel")}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 bg-slate-800/90 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-700 hover:border-amber-400 shadow-sm"
          >
            <MousePointer className="w-3.5 h-3.5 text-amber-400" />
            <span>3. PANEL</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectionMode?.("structure")}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 bg-slate-800/90 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-700 hover:border-amber-400 shadow-sm"
          >
            <Box className="w-3.5 h-3.5 text-amber-400" />
            <span>4. STRUCTURE</span>
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-xs cursor-pointer"
            title="Close Micro Adjust"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VIEW 2: MODE-SPECIFIC CONTROLS (Only visible after mode selection)
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-2 bg-slate-900/98 border border-slate-800 px-3.5 py-2 rounded-2xl shadow-xl text-xs text-white shrink-0 select-none animate-in fade-in duration-150">
      {/* ── ROW 1: ACTIVE MODE HEADER & QUICK SWITCHER ───────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          {/* Back / Change Mode Button */}
          <button
            type="button"
            onClick={() => setSelectionMode?.(null)}
            className="h-6 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition"
            title="Return to Mode Selection"
          >
            <span>← Mode Select</span>
          </button>

          {/* Direct Mode Tabs */}
          <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setSelectionMode?.("row");
                if (rows.length > 0 && selectedRowIndex == null) setSelectedRowIndex?.(rows[0].rowIndex);
              }}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                selectionMode === "row" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Row</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectionMode?.("group");
                setSelectedGroupId?.(currentSelectedRow ? currentSelectedRow.rowIndex : 0);
              }}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                selectionMode === "group" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Grid className="w-3 h-3" />
              <span>Group</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectionMode?.("panel")}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                isPanelMode ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <MousePointer className="w-3 h-3" />
              <span>Panel</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectionMode?.("structure")}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                selectionMode === "structure" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Box className="w-3 h-3" />
              <span>Structure</span>
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
                : "Select a row to adjust"
            )}
            {selectionMode === "group" && (
              `Selected: Structure Group ${currentGroupId + 1} (${currentGroupPanels.length} Panels + Rails)`
            )}
            {isPanelMode && (
              activeSelectedIds.length > 0
                ? `Selected: ${activeSelectedIds.length} Panel${activeSelectedIds.length === 1 ? "" : "s"} (Shift+Click multi-select)`
                : "Click panel to select (Shift+Click to multi-select)"
            )}
            {selectionMode === "structure" && (
              selectedMemberId ? `Selected: Member #${selectedMemberId.slice(-4)}` : "Click support post or rail to adjust"
            )}
          </span>

          {/* Manual Override Status Badge */}
          {isOverridden && (
            <span className="text-emerald-400 font-mono text-[10.5px] font-bold px-2 py-0.5 bg-emerald-950/60 border border-emerald-700/60 rounded-lg">
              Override: ON (+{panels.length - baselineCount})
            </span>
          )}

          {hasManualAdjustments && autoLayoutBaselinePanels && autoLayoutBaselinePanels.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPanels(autoLayoutBaselinePanels);
                setHasManualAdjustments?.(false);
                toast.success(`Restored auto-layout baseline (${autoLayoutBaselinePanels.length} panels)`);
              }}
              className="h-6 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 text-[10px] font-semibold transition cursor-pointer"
              title="Restore initial auto-generation baseline"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span>Restore Baseline</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-xs cursor-pointer ml-1"
              title="Close Micro Adjust"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── ROW 2: ACTIVE MODE DEDICATED CONTROLS ────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Step Size Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-semibold">Step:</span>
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
        </div>

        {/* ── MODE 1: ROW ADJUST SPECIALIZED CONTROLS ───────────────────────── */}
        {selectionMode === "row" && (
          <div className="flex flex-wrap items-center gap-3">
            {/* THREE-STATE SHIFT CONTROLS: LEFT / CENTER / RIGHT */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={handleShiftRowLeft}
                className="h-7 px-3 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 active:scale-95 text-slate-200 font-bold text-xs transition border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Shift complete row to the left"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>SHIFT LEFT</span>
              </button>

              <button
                type="button"
                onClick={handleResetRowCenter}
                className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-cyan-300 font-bold text-xs transition border border-slate-700 flex items-center gap-1 cursor-pointer shadow-sm"
                title="Reset row alignment back to center baseline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>CENTER / RESET</span>
              </button>

              <button
                type="button"
                onClick={handleShiftRowRight}
                className="h-7 px-3 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 active:scale-95 text-slate-200 font-bold text-xs transition border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Shift complete row to the right"
              >
                <span>SHIFT RIGHT</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Fine Nudge Controls (-X, +X, -Y, +Y) */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleMicroMove(-stepIncrement, 0)}
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs border border-slate-700"
                title="Fine shift left (-X)"
              >
                ← -X
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(stepIncrement, 0)}
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs border border-slate-700"
                title="Fine shift right (+X)"
              >
                +X →
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(0, -stepIncrement)}
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs border border-slate-700"
                title="Fine shift down / South (-Y)"
              >
                ↓ -Y
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(0, stepIncrement)}
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs border border-slate-700"
                title="Fine shift up / North (+Y)"
              >
                ↑ +Y
              </button>
            </div>

            {/* Row Tilt Control */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-xl">
              <span className="text-[10px] text-slate-400 font-semibold">Tilt:</span>
              <button
                type="button"
                onClick={() => handleAdjustRowTilt(-1)}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300"
              >
                -
              </button>
              <span className="font-mono text-cyan-400 font-bold text-xs px-1">{currentTilt}°</span>
              <button
                type="button"
                onClick={() => handleAdjustRowTilt(1)}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300"
              >
                +
              </button>
            </div>

            {/* Row Switcher */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (rows.length === 0) return;
                  const cIdx = rows.findIndex((r) => r.rowIndex === selectedRowIndex);
                  const prevIdx = cIdx > 0 ? cIdx - 1 : rows.length - 1;
                  setSelectedRowIndex?.(rows[prevIdx].rowIndex);
                }}
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
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
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Next Row
              </button>
            </div>
          </div>
        )}

        {/* ── MODE 2: GROUP ADJUST SPECIALIZED CONTROLS ─────────────────────── */}
        {selectionMode === "group" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleMicroMove(-stepIncrement, 0)}
                className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs border border-slate-700"
              >
                ← -X
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(stepIncrement, 0)}
                className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs border border-slate-700"
              >
                +X →
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(0, -stepIncrement)}
                className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs border border-slate-700"
              >
                ↓ -Y
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(0, stepIncrement)}
                className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs border border-slate-700"
              >
                ↑ +Y
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleRotateSelection(15)}
              className="h-7 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 font-semibold text-xs cursor-pointer"
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
              className="h-7 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 font-semibold text-xs cursor-pointer"
            >
              <span>Next Group →</span>
            </button>
          </div>
        )}

        {/* ── MODE 3: CUSTOM PANEL ADJUST SPECIALIZED CONTROLS ───────────────── */}
        {isPanelMode && (
          <div className="flex flex-wrap items-center gap-2">
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

            {/* ADD PANEL (MANUAL OVERRIDE) */}
            <button
              type="button"
              onClick={handleAddSinglePanelNear}
              className="h-7 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 font-bold text-xs shadow-md transition cursor-pointer"
              title="Add panel (manual override: not blocked by automatic capacity)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Panel</span>
            </button>

            {/* CLICK ON ROOF TO PLACE */}
            {setActiveTool && (
              <button
                type="button"
                onClick={() => {
                  setActiveTool("add_panel");
                  toast.info("Click anywhere on the roof to place panel.");
                }}
                className="h-7 px-2.5 rounded-xl bg-amber-950/70 hover:bg-amber-900 border border-amber-700/60 text-amber-300 hover:text-white flex items-center gap-1 font-semibold text-xs cursor-pointer"
                title="Click anywhere on the roof boundary to place a panel directly"
              >
                <Crosshair className="w-3 h-3 text-amber-400" />
                <span>Click to Place</span>
              </button>
            )}

            {/* MULTI-PANEL DIRECTIONAL MOVE */}
            <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => handleMicroMove(-stepIncrement, 0)}
                disabled={activeSelectedIds.length === 0}
                className="h-6 px-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 font-mono font-bold text-xs"
                title="Move selection West (-X)"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(stepIncrement, 0)}
                disabled={activeSelectedIds.length === 0}
                className="h-6 px-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 font-mono font-bold text-xs"
                title="Move selection East (+X)"
              >
                →
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(0, -stepIncrement)}
                disabled={activeSelectedIds.length === 0}
                className="h-6 px-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 font-mono font-bold text-xs"
                title="Move selection South (-Y)"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(0, stepIncrement)}
                disabled={activeSelectedIds.length === 0}
                className="h-6 px-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 font-mono font-bold text-xs"
                title="Move selection North (+Y)"
              >
                ↑
              </button>
            </div>

            {/* Rotate Selection */}
            <button
              type="button"
              onClick={() => handleRotateSelection(15)}
              disabled={activeSelectedIds.length === 0}
              className="h-7 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 font-semibold text-xs cursor-pointer"
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
              className="h-7 px-2.5 rounded-xl bg-red-950/60 hover:bg-red-900 disabled:opacity-40 text-red-300 hover:text-white border border-red-800/60 flex items-center gap-1 font-semibold text-xs cursor-pointer"
              title="Delete selected panel(s)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({activeSelectedIds.length})</span>
            </button>
          </div>
        )}

        {/* ── MODE 4: STRUCTURE ADJUST SPECIALIZED CONTROLS ─────────────────── */}
        {selectionMode === "structure" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-300 italic">
              Click support post or rail in 3D to fine-adjust position:
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleMicroMove(-stepIncrement, 0)}
                disabled={!selectedMemberId}
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-mono font-bold text-xs border border-slate-700"
              >
                ← -X
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(stepIncrement, 0)}
                disabled={!selectedMemberId}
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-mono font-bold text-xs border border-slate-700"
              >
                +X →
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(0, -stepIncrement)}
                disabled={!selectedMemberId}
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-mono font-bold text-xs border border-slate-700"
              >
                ↓ -Y
              </button>
              <button
                type="button"
                onClick={() => handleMicroMove(0, stepIncrement)}
                disabled={!selectedMemberId}
                className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-mono font-bold text-xs border border-slate-700"
              >
                ↑ +Y
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
