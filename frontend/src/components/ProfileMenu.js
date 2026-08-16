import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User as UserIcon, Mail, Lock, Building2, LogOut, Camera, Loader2 } from "lucide-react";

/**
 * ProfileMenu — top-right avatar dropdown with My Profile / Change Email /
 * Change Password / Company Details / Logout entries. Each settings flow opens
 * an inline dialog (no separate routes needed).
 */
export default function ProfileMenu() {
  const { user, company, logout, refreshCompany } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(null); // 'profile' | 'email' | 'password' | null

  const initials = (user?.name || "?").slice(0, 1).toUpperCase();
  const photoUrl = user?.profile_photo_file_id ? fileUrl(user.profile_photo_file_id) : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-sm font-semibold ring-2 ring-transparent hover:ring-blue-200 focus:outline-none focus:ring-blue-300 transition overflow-hidden"
            data-testid="profile-menu-trigger"
            aria-label="Profile menu"
          >
            {photoUrl ? <img src={photoUrl} alt={user?.name} className="w-full h-full object-cover" /> : initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60" data-testid="profile-menu-content">
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-sm font-semibold overflow-hidden shrink-0">
                {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : initials}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm text-slate-900 truncate">{user?.name}</div>
                <div className="text-xs text-slate-500 truncate">{user?.email}</div>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen("profile")} data-testid="menu-my-profile">
            <UserIcon className="w-4 h-4 mr-2" /> My Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("email")} data-testid="menu-change-email">
            <Mail className="w-4 h-4 mr-2" /> Change Email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("password")} data-testid="menu-change-password">
            <Lock className="w-4 h-4 mr-2" /> Change Password
          </DropdownMenuItem>
          {(user?.role === "Admin" || user?.role === "Super Admin" || user?.user_type === "owner" || user?.user_type === "platform_owner" || user?.is_super_admin) && (
            <DropdownMenuItem onClick={() => nav("/profile")} data-testid="menu-company-details">
              <Building2 className="w-4 h-4 mr-2" /> Company Details
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => { await logout(); nav("/login"); }}
            className="text-red-600 focus:text-red-600 focus:bg-red-50"
            data-testid="menu-logout"
          >
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MyProfileDialog open={open === "profile"} onClose={() => setOpen(null)} onSaved={() => refreshCompany()} />
      <ChangeEmailDialog open={open === "email"} onClose={() => setOpen(null)} />
      <ChangePasswordDialog open={open === "password"} onClose={() => setOpen(null)} />
    </>
  );
}

function MyProfileDialog({ open, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [photoId, setPhotoId] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    api.get("/auth/me").then(({ data }) => {
      setName(data.user?.name || "");
      setMobile(data.user?.mobile || "");
      setPhotoId(data.user?.profile_photo_file_id || "");
    }).catch(() => {});
  }, [open]);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("category", "avatar");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPhotoId(data.id);
      // Save immediately so the avatar shows even if user cancels other edits
      await api.patch("/auth/me", { profile_photo_file_id: data.id });
      toast.success("Photo uploaded");
      onSaved?.();
      window.dispatchEvent(new Event("solarix:auth-refresh"));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.patch("/auth/me", { name, mobile, profile_photo_file_id: photoId });
      toast.success("Profile updated");
      onSaved?.();
      window.dispatchEvent(new Event("solarix:auth-refresh"));
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="my-profile-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit" }}>My Profile</DialogTitle>
          <DialogDescription className="text-xs">Update your name, mobile and profile photo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-2xl font-semibold overflow-hidden ring-2 ring-white shadow">
                {photoId ? <img src={fileUrl(photoId)} alt="" className="w-full h-full object-cover" /> : (name || "?").slice(0, 1).toUpperCase()}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="profile-photo-input" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-center shadow-sm transition"
                title="Change photo"
                data-testid="profile-photo-btn"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex-1 text-xs text-slate-500">
              JPG or PNG up to 10MB. The photo appears in your top-right avatar across the app.
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" data-testid="profile-name" />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mobile</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} className="mt-1.5" data-testid="profile-mobile" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={busy} data-testid="profile-save">{busy ? "Saving…" : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeEmailDialog({ open, onClose }) {
  const { user } = useAuth();
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewEmail("");
      setConfirmEmail("");
      setPwd("");
    }
  }, [open]);

  const currentEmail = user?.email || "";

  const submit = async () => {
    const normNew = newEmail.toLowerCase().trim();
    const normConfirm = confirmEmail.toLowerCase().trim();

    if (!normNew.includes("@") || normNew.length < 5) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (normNew === currentEmail.toLowerCase().trim()) {
      toast.error("New email cannot be the same as your current email");
      return;
    }
    if (normNew !== normConfirm) {
      toast.error("New email and Confirm email do not match");
      return;
    }
    if (!pwd) {
      toast.error("Current password is required to verify your identity");
      return;
    }

    setBusy(true);
    try {
      await api.post("/auth/change-email", { new_email: normNew, current_password: pwd });
      toast.success("Authentication email updated. Use your new email next time you sign in.");
      window.dispatchEvent(new Event("solarix:auth-refresh"));
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="change-email-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit" }}>Change Authentication Email</DialogTitle>
          <DialogDescription className="text-xs">
            Update the email address you use to log in to SOLARIX. Company invoice/document details will remain unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 mt-2">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Authentication Email</Label>
            <Input value={currentEmail} readOnly className="mt-1.5 bg-slate-100 cursor-not-allowed text-slate-600 font-mono text-xs" />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">New Email Address</Label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@company.com"
              className="mt-1.5"
              data-testid="new-email-input"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confirm New Email</Label>
            <Input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder="Confirm new email"
              className="mt-1.5"
              data-testid="confirm-email-input"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Password</Label>
            <Input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Required to confirm changes"
              className="mt-1.5"
              data-testid="email-current-password"
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={busy} data-testid="change-email-submit">
            {busy ? "Updating…" : "Update Authentication Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }, [open]);

  const hasLength = next.length >= 6;
  const matches = next.length > 0 && next === confirm;

  const submit = async () => {
    if (!current) {
      toast.error("Please enter your current password");
      return;
    }
    if (!hasLength) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (!matches) {
      toast.error("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password changed successfully");
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit" }}>Change Password</DialogTitle>
          <DialogDescription className="text-xs">
            Update your account login password. Passwords must contain at least 6 characters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 mt-2">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Password</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="mt-1.5" data-testid="pwd-current" />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">New Password</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1.5" placeholder="Minimum 6 characters" data-testid="pwd-new" />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confirm New Password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5" placeholder="Re-enter new password" data-testid="pwd-confirm" />
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
            <div className={`flex items-center gap-1.5 ${hasLength ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
              <span>{hasLength ? "✓" : "○"}</span> Minimum 6 characters
            </div>
            <div className={`flex items-center gap-1.5 ${matches ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
              <span>{matches ? "✓" : "○"}</span> Passwords match
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={busy || !hasLength || !matches} data-testid="change-password-submit">
            {busy ? "Updating…" : "Change Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
