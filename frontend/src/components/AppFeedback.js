import React, { useState, useRef, useEffect, useCallback } from "react";
import api, { formatApiError } from "../lib/api";
import { MessageSquarePlus, X, Send, GripHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";

export default function AppFeedback() {
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState("Bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();

  // Dragging position state
  const [btnPos, setBtnPos] = useState(null);
  const [panelPos, setPanelPos] = useState(null);

  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const isDraggingBtn = useRef(false);
  const isDraggingPanel = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, startLeft: 0, startTop: 0, hasMoved: false });

  // Clamp positions to viewport on window resize
  const clampPositions = useCallback(() => {
    const margin = 10;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    setBtnPos((prev) => {
      if (!prev) return null;
      const w = btnRef.current?.offsetWidth || 48;
      const h = btnRef.current?.offsetHeight || 48;
      return {
        x: Math.max(margin, Math.min(prev.x, winW - w - margin)),
        y: Math.max(margin, Math.min(prev.y, winH - h - margin))
      };
    });

    setPanelPos((prev) => {
      if (!prev) return null;
      const w = panelRef.current?.offsetWidth || 340;
      const h = panelRef.current?.offsetHeight || 380;
      return {
        x: Math.max(margin, Math.min(prev.x, winW - w - margin)),
        y: Math.max(margin, Math.min(prev.y, winH - h - margin))
      };
    });
  }, []);

  useEffect(() => {
    window.addEventListener("resize", clampPositions);
    return () => window.removeEventListener("resize", clampPositions);
  }, [clampPositions]);

  // Pointer drag for floating button
  const handleBtnPointerDown = (e) => {
    // Only primary button / touch
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;

    isDraggingBtn.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      hasMoved: false
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handleBtnPointerMove = (e) => {
    if (!isDraggingBtn.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    if (!dragStart.current.hasMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      dragStart.current.hasMoved = true;
    }

    if (dragStart.current.hasMoved) {
      const margin = 8;
      const w = btnRef.current?.offsetWidth || 48;
      const h = btnRef.current?.offsetHeight || 48;
      const newX = dragStart.current.startLeft + dx;
      const newY = dragStart.current.startTop + dy;

      const clampedX = Math.max(margin, Math.min(newX, window.innerWidth - w - margin));
      const clampedY = Math.max(margin, Math.min(newY, window.innerHeight - h - margin));

      setBtnPos({ x: clampedX, y: clampedY });
    }
  };

  const handleBtnPointerUp = (e) => {
    if (!isDraggingBtn.current) return;
    isDraggingBtn.current = false;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    // If it was a tap/click without moving, toggle the modal
    if (!dragStart.current.hasMoved) {
      if (!open && btnPos) {
        // Compute smart panel position when opening
        const margin = 12;
        const panelW = Math.min(window.innerWidth - 24, 384);
        const panelH = 380;
        let pX = btnPos.x + 48 - panelW;
        if (pX < margin) pX = btnPos.x;
        pX = Math.max(margin, Math.min(pX, window.innerWidth - panelW - margin));

        let pY = btnPos.y - panelH - 12;
        if (pY < margin) pY = btnPos.y + 56;
        pY = Math.max(margin, Math.min(pY, window.innerHeight - panelH - margin));

        setPanelPos({ x: pX, y: pY });
      }
      setOpen((prev) => !prev);
    }
  };

  // Pointer drag for open panel header
  const handlePanelPointerDown = (e) => {
    // If clicking close button or form controls, do not drag
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea") || e.target.closest("select")) {
      return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    isDraggingPanel.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      hasMoved: false
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePanelPointerMove = (e) => {
    if (!isDraggingPanel.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    const margin = 8;
    const w = panelRef.current?.offsetWidth || 340;
    const h = panelRef.current?.offsetHeight || 380;
    const newX = dragStart.current.startLeft + dx;
    const newY = dragStart.current.startTop + dy;

    const clampedX = Math.max(margin, Math.min(newX, window.innerWidth - w - margin));
    const clampedY = Math.max(margin, Math.min(newY, window.innerHeight - h - margin));

    setPanelPos({ x: clampedX, y: clampedY });
  };

  const handlePanelPointerUp = (e) => {
    if (!isDraggingPanel.current) return;
    isDraggingPanel.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter a feedback message");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/feedback", {
        feedback_type: feedbackType,
        message: message.trim(),
        page: location.pathname
      });
      toast.success("Feedback submitted! Thank you.");
      setMessage("");
      setOpen(false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Compute inline styles for button positioning
  const btnStyle = btnPos
    ? {
        position: "fixed",
        left: `${btnPos.x}px`,
        top: `${btnPos.y}px`,
        bottom: "auto",
        right: "auto",
        touchAction: "none"
      }
    : {
        touchAction: "none"
      };

  // Compute inline styles for panel positioning
  const panelStyle = panelPos
    ? {
        position: "fixed",
        left: `${panelPos.x}px`,
        top: `${panelPos.y}px`,
        bottom: "auto",
        right: "auto"
      }
    : {};

  return (
    <>
      {/* Draggable Floating Button */}
      <button
        ref={btnRef}
        onPointerDown={handleBtnPointerDown}
        onPointerMove={handleBtnPointerMove}
        onPointerUp={handleBtnPointerUp}
        onPointerCancel={handleBtnPointerUp}
        style={btnStyle}
        className={`${
          btnPos ? "" : "fixed bottom-5 right-5"
        } z-40 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center group select-none cursor-grab active:cursor-grabbing`}
        title="Drag to reposition / Click to send feedback"
      >
        <MessageSquarePlus className="w-5 h-5 group-hover:scale-110 transition-transform pointer-events-none" />
      </button>

      {/* Draggable Feedback Panel */}
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className={`${
            panelPos ? "" : "fixed bottom-16 right-5"
          } z-50 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 font-sans animate-in fade-in slide-in-from-bottom-3 duration-200`}
        >
          {/* Draggable Header */}
          <div
            onPointerDown={handlePanelPointerDown}
            onPointerMove={handlePanelPointerMove}
            onPointerUp={handlePanelPointerUp}
            onPointerCancel={handlePanelPointerUp}
            style={{ touchAction: "none" }}
            className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3 cursor-grab active:cursor-grabbing select-none"
            title="Drag to reposition panel"
          >
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <MessageSquarePlus className="w-4 h-4 text-blue-600 pointer-events-none" /> Share Workspace Feedback
            </div>
            <div className="flex items-center gap-1">
              <GripHorizontal className="w-4 h-4 text-slate-300 pointer-events-none mr-1" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer hover:bg-slate-100 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Feedback Type</Label>
              <Select value={feedbackType} onValueChange={setFeedbackType}>
                <SelectTrigger className="mt-1 text-xs h-8 bg-slate-50"><SelectValue /></SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="Bug">🐛 Bug Report</SelectItem>
                  <SelectItem value="Suggestion">💡 Feature Suggestion</SelectItem>
                  <SelectItem value="UI Issue">🎨 UI / Design Issue</SelectItem>
                  <SelectItem value="Performance">⚡ Performance Issue</SelectItem>
                  <SelectItem value="Other">❓ Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Message / Issue Details</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue or suggestion..."
                rows={4}
                className="mt-1 text-xs bg-slate-50"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-slate-400 font-mono">Page: {location.pathname}</span>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 gap-1.5 shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" /> {submitting ? "Sending..." : "Submit"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
