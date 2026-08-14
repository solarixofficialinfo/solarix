import React, { useState } from "react";
import api, { formatApiError } from "../lib/api";
import { MessageSquarePlus, X, Send, Bug, Lightbulb, Monitor, Zap, HelpCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-40 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
        title="Send Workspace Feedback"
      >
        <MessageSquarePlus className="w-5 h-5 group-hover:scale-110 transition-transform" />
      </button>

      {/* Feedback Panel */}
      {open && (
        <div className="fixed bottom-16 right-5 z-50 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 font-sans animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <MessageSquarePlus className="w-4 h-4 text-blue-600" /> Share Workspace Feedback
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md">
              <X className="w-4 h-4" />
            </button>
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
