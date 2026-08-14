import React, { useState } from "react";
import api from "../../lib/api";
import { Input } from "./input";
import { Label } from "./label";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function PincodeInput({ pincode, onPincodeChange, onLocationFetched, className }) {
  const [loading, setLoading] = useState(false);

  const handlePincodeChange = async (e) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    onPincodeChange(val);

    if (val.length === 6) {
      setLoading(true);
      try {
        const res = await api.get(`/location/pincode/${val}`);
        if (res.data && (res.data.city || res.data.state)) {
          onLocationFetched({
            city: res.data.city || "",
            district: res.data.district || "",
            state: res.data.state || ""
          });
          toast.success(`Location found: ${res.data.city ? res.data.city + ", " : ""}${res.data.state}`);
        }
      } catch (err) {
        console.warn("Pincode lookup fallback:", err);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="relative">
      <Label className="text-xs font-semibold text-slate-700">Pincode</Label>
      <div className="relative mt-1">
        <Input
          type="text"
          value={pincode}
          onChange={handlePincodeChange}
          placeholder="6-digit Pincode"
          maxLength={6}
          className={`pr-8 text-xs font-mono font-semibold ${className || ""}`}
        />
        <div className="absolute right-2 top-2.5 text-slate-400">
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <MapPin className="w-4 h-4 text-slate-400" />}
        </div>
      </div>
    </div>
  );
}
