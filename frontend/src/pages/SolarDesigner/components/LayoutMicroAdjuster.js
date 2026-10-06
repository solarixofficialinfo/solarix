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


  // Ensure selectionMode defaults to 'row' if null
  useEffect(() => {
    if (!selectionMode) {
      setSelectionMode?.("row");
      if (rows.length > 0 && selectedRowIndex == null) {
        setSelectedRowIndex?.(rows[0].rowIndex);
      }
    }
  }, [selectionMode, setSelectionMode, rows, selectedRowIndex, setSelectedRowIndex]);

  const activeMode = selectionMode || "row";
  const isPanelMode = activeMode === "custom" || activeMode === "panel";
  const currentTilt = currentSelectedRow?.panels[0]?.tilt ?? 15;

  // Comparison metrics for manual override
  const baselineCount = recommendedCapacity != null ? recommendedCapacity : autoLayoutBaselinePanels?.length || panels.length;
  const isOverridden = panels.length > baselineCount;

  return (
    <div className="w-88 sm:w-96 bg-slate-900/98 backdrop-blur-xl border border-amber-500/40 rounded-2xl shadow-2xl p-3.5 text-xs text-white shrink-0 select-none flex flex-col gap-3 font-sans animate-in fade-in zoom-in-95 duration-150">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
            <Sliders className="w-4 h-4" />
          </span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-wide text-white uppercase">
              Micro Adjust
            </span>
            {activeSection && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono font-semibold">
                {activeSection.name || "Section"}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {hasManualAdjustments && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 font-mono font-bold">
              Override: ON
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-xs cursor-pointer transition"
              title="Close Micro Adjust"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── MODE SELECTOR (4 TABS) ── */}
      <div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>Mode</span>
          <span className="text-[10px] text-amber-400/90 font-mono font-bold">
            {activeMode.toUpperCase()} ACTIVE
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setSelectionMode?.("row");
              if (rows.length > 0 && selectedRowIndex == null) {
                setSelectedRowIndex?.(rows[0].rowIndex);
              }
            }}
            className={`py-2 px-1 rounded-lg text-xs font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
              activeMode === "row"
                ? "bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-300"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="text-[11px]">ROW</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectionMode?.("group");
              setSelectedGroupId?.(currentSelectedRow ? currentSelectedRow.rowIndex : 0);
            }}
            className={`py-2 px-1 rounded-lg text-xs font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
              activeMode === "group"
                ? "bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-300"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Grid className="w-4 h-4" />
            <span className="text-[11px]">GROUP</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectionMode?.("panel")}
            className={`py-2 px-1 rounded-lg text-xs font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
              isPanelMode
                ? "bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-300"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <MousePointer className="w-4 h-4" />
            <span className="text-[11px]">PANEL</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectionMode?.("structure")}
            className={`py-2 px-1 rounded-lg text-xs font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
              activeMode === "structure"
                ? "bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-300"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Box className="w-4 h-4" />
            <span className="text-[11px]">STRUCTURE</span>
          </button>
        </div>
      </div>

      {/* ── SELECTION STATUS CARD ── */}
      <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-2.5 flex flex-col gap-2">
        {/* ROW MODE SELECTION INFO */}
        {activeMode === "row" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block">Selected Row</span>
                <span className="font-bold text-amber-400 font-mono text-sm">
                  {currentSelectedRow ? `Row ${currentSelectedRow.visualIndex}` : "None"}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Panels in Row</span>
                <span className="font-bold text-white font-mono text-sm">
                  {currentSelectedRow ? currentSelectedRow.panels.length : 0}
                </span>
              </div>
            </div>

            {/* Row Switcher */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-900">
              <button
                type="button"
                onClick={() => {
                  if (rows.length === 0) return;
                  const cIdx = rows.findIndex((r) => r.rowIndex === selectedRowIndex);
                  const prevIdx = cIdx > 0 ? cIdx - 1 : rows.length - 1;
                  setSelectedRowIndex?.(rows[prevIdx].rowIndex);
                }}
                className="flex-1 py-1 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <span>‹ Prev Row</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (rows.length === 0) return;
                  const cIdx = rows.findIndex((r) => r.rowIndex === selectedRowIndex);
                  const nextIdx = cIdx < rows.length - 1 ? cIdx + 1 : 0;
                  setSelectedRowIndex?.(rows[nextIdx].rowIndex);
                }}
                className="flex-1 py-1 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <span>Next Row ›</span>
              </button>
            </div>
          </div>
        )}

        {/* GROUP MODE SELECTION INFO */}
        {activeMode === "group" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block">Selected Group</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  Group {Number(currentGroupId) + 1}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Panels in Group</span>
                <span className="font-bold text-white font-mono text-sm">
                  {currentGroupPanels.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-900">
              <button
                type="button"
                onClick={() => {
                  const nextGroupId = (Number(currentGroupId) + 1) % Math.max(1, rows.length);
                  setSelectedGroupId?.(nextGroupId);
                }}
                className="w-full py-1 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <span>Next Group ›</span>
              </button>
            </div>
          </div>
        )}

        {/* PANEL MODE SELECTION INFO */}
        {isPanelMode && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block">Selection</span>
                <span className="font-bold text-cyan-400 font-mono text-sm">
                  {activeSelectedIds.length > 0
                    ? `${activeSelectedIds.length} Panel${activeSelectedIds.length === 1 ? "" : "s"}`
                    : "No Panel Selected"}
                </span>
              </div>
              {activeSelectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPanelId?.(null);
                    setSelectedPanelIds?.([]);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/60 text-[10.5px] font-bold cursor-pointer transition"
                  title="Clear all panel selections"
                >
                  Clear Selection
                </button>
              )}
            </div>
            <p className="text-[10.5px] text-slate-400 leading-tight">
              Single-click to select one panel. Hold <kbd className="px-1 py-0.5 bg-slate-800 rounded font-mono text-slate-300 text-[9.5px]">Shift</kbd> + click to select multiple.
            </p>
          </div>
        )}

        {/* STRUCTURE MODE SELECTION INFO */}
        {activeMode === "structure" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block">Selected Member</span>
                <span className="font-bold text-amber-400 font-mono text-sm">
                  {selectedMemberId ? `#${selectedMemberId.slice(-6)}` : "None"}
                </span>
              </div>
              {selectedMemberId && (
                <button
                  type="button"
                  onClick={() => setSelectedMemberId?.(null)}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 text-[10px] font-semibold cursor-pointer"
                >
                  Deselect
                </button>
              )}
            </div>
            <p className="text-[10.5px] text-slate-400 leading-tight">
              Click any support column/post, rail, or cross brace in the 3D scene to adjust.
            </p>
          </div>
        )}
      </div>

      {/* ── MOVEMENT & DIRECTION CONTROLS ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Movement
          </span>

          {/* Step Size Selector */}
          <div className="flex items-center gap-1">
            <span className="text-[9.5px] text-slate-500 font-medium mr-0.5">Step:</span>
            {[0.02, 0.05, 0.1, 0.2].map((inc) => (
              <button
                key={inc}
                type="button"
                onClick={() => setStepIncrement(inc)}
                className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition cursor-pointer ${
                  stepIncrement === inc
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700/60"
                }`}
              >
                {inc.toFixed(2)}m
              </button>
            ))}
          </div>
        </div>

        {/* Directional Pad */}
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-950/80 rounded-xl border border-slate-800/90">
          <div />
          <button
            type="button"
            onClick={() => handleMicroMove(0, stepIncrement)}
            className="h-8 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-xs transition border border-slate-700 flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
            title="Move North / Up (+Y)"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>Up</span>
          </button>
          <div />

          <button
            type="button"
            onClick={() => handleMicroMove(-stepIncrement, 0)}
            className="h-8 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-xs transition border border-slate-700 flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
            title="Move West / Left (-X)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Left</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeMode === "row") handleResetRowCenter();
            }}
            disabled={activeMode !== "row"}
            className="h-8 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-cyan-400 font-mono text-[10px] font-bold transition border border-slate-800 flex items-center justify-center cursor-pointer"
            title={activeMode === "row" ? "Reset row center alignment" : "Center"}
          >
            {activeMode === "row" ? "Center" : "•"}
          </button>

          <button
            type="button"
            onClick={() => handleMicroMove(stepIncrement, 0)}
            className="h-8 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-xs transition border border-slate-700 flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
            title="Move East / Right (+X)"
          >
            <span>Right</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <div />
          <button
            type="button"
            onClick={() => handleMicroMove(0, -stepIncrement)}
            className="h-8 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-xs transition border border-slate-700 flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
            title="Move South / Down (-Y)"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Down</span>
          </button>
          <div />
        </div>

        {/* ── MODE-SPECIFIC EXTRA CONTROLS ── */}
        {activeMode === "row" && (
          <div className="flex flex-col gap-2 pt-1 border-t border-slate-800/80">
            {/* Quick 3-State Row Shift */}
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={handleShiftRowLeft}
                className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 font-bold text-[11px] border border-slate-700 flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Shift Left</span>
              </button>
              <button
                type="button"
                onClick={handleResetRowCenter}
                className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-[11px] border border-slate-700 flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Center</span>
              </button>
              <button
                type="button"
                onClick={handleShiftRowRight}
                className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 font-bold text-[11px] border border-slate-700 flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <span>Shift Right</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Row Tilt Control */}
            <div className="flex items-center justify-between bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold">Row Tilt:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAdjustRowTilt(-1)}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 border border-slate-700"
                >
                  -
                </button>
                <span className="font-mono text-cyan-400 font-bold text-xs min-w-[28px] text-center">
                  {currentTilt}°
                </span>
                <button
                  type="button"
                  onClick={() => handleAdjustRowTilt(1)}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 border border-slate-700"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {activeMode === "group" && (
          <div className="pt-1 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => handleRotateSelection(15)}
              className="w-full py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 font-semibold text-xs transition cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Rotate Group 15°</span>
            </button>
          </div>
        )}

        {isPanelMode && (
          <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800/80">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleRotateSelection(15)}
                disabled={activeSelectedIds.length === 0}
                className="py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center gap-1 font-semibold text-xs cursor-pointer"
              >
                <RotateCw className="w-3 h-3 text-blue-400" />
                <span>Rotate 15°</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={activeSelectedIds.length === 0}
                className="py-1.5 px-2 rounded-xl bg-red-950/60 hover:bg-red-900 disabled:opacity-40 text-red-300 hover:text-white border border-red-800/60 flex items-center justify-center gap-1 font-semibold text-xs cursor-pointer"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
                <span>Delete ({activeSelectedIds.length})</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleAddSinglePanelNear}
                className="py-1.5 px-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-1 font-bold text-xs shadow-md transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Panel</span>
              </button>

              <button
                type="button"
                onClick={() => setSnapEnabled?.(!snapEnabled)}
                className={`py-1.5 px-2 rounded-xl border flex items-center justify-center gap-1 font-bold text-xs transition cursor-pointer ${
                  snapEnabled
                    ? "bg-emerald-950/60 border-emerald-600/70 text-emerald-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                }`}
              >
                <Magnet className="w-3.5 h-3.5" />
                <span>Snap {snapEnabled ? "ON" : "OFF"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER: BASELINE RESTORE ── */}
      {hasManualAdjustments && autoLayoutBaselinePanels && autoLayoutBaselinePanels.length > 0 && (
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">Manual edits active</span>
          <button
            type="button"
            onClick={() => {
              setPanels(autoLayoutBaselinePanels);
              setHasManualAdjustments?.(false);
              toast.success(`Restored auto-layout baseline (${autoLayoutBaselinePanels.length} panels)`);
            }}
            className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 text-[10.5px] font-semibold transition cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-amber-400" />
            <span>Restore Baseline</span>
          </button>
        </div>
      )}
    </div>
  );
}
