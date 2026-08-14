import React, { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, MapPin, Loader2, Check, ChevronDown } from "lucide-react";

export default function LocationAutoFill({
  city = "",
  state = "",
  pincode = "",
  onChange,
  onCityChange,
  onStateChange,
  onPincodeChange,
  required = false,
  className = "",
  dark = false,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [availablePins, setAvailablePins] = useState([]);
  const [apiError, setApiError] = useState(false);

  const wrapperRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search when user types in search box or city
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setApiError(false);
      try {
        // If 6 digits numeric, search pincode
        if (/^\d{6}$/.test(searchTerm.strip ? searchTerm.strip() : searchTerm.trim())) {
          const res = await api.get(`/location/pincode/${searchTerm.trim()}`);
          if (res.data && res.data.state) {
            const poList = res.data.post_offices || [];
            const mapped = poList.length > 0
              ? poList.map((po) => ({
                  name: po,
                  city: res.data.city || res.data.district || po,
                  district: res.data.district,
                  state: res.data.state,
                  pincode: res.data.pincode,
                }))
              : [{
                  name: res.data.city,
                  city: res.data.city,
                  district: res.data.district,
                  state: res.data.state,
                  pincode: res.data.pincode,
                }];
            setResults(mapped);
            setOpen(true);
          } else {
            setResults([]);
          }
        } else {
          // Otherwise search city / post office name
          const res = await api.get(`/location/city/${encodeURIComponent(searchTerm.trim())}`);
          if (res.data && res.data.results && res.data.results.length > 0) {
            setResults(res.data.results);
            setOpen(true);
          } else {
            // Direct fallback to postal pincode API
            const fallbackRes = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(searchTerm.trim())}`)
              .then((r) => r.json())
              .catch(() => null);
            if (fallbackRes && fallbackRes[0]?.Status === "Success") {
              const mapped = (fallbackRes[0].PostOffice || []).map((po) => ({
                name: po.Name,
                city: po.District || po.Name,
                district: po.District,
                state: po.State,
                pincode: po.Pincode,
              }));
              setResults(mapped);
              setOpen(true);
            } else {
              setResults([]);
            }
          }
        }
      } catch (err) {
        console.warn("Location search error:", err);
        setApiError(true);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const selectLocation = (item) => {
    const resolvedCity = item.district || item.city || item.name;
    const resolvedState = item.state || "";
    const resolvedPin = item.pincode || "";

    if (onChange) {
      onChange({ city: resolvedCity, state: resolvedState, pincode: resolvedPin });
    } else {
      if (onCityChange) onCityChange(resolvedCity);
      if (onStateChange) onStateChange(resolvedState);
      if (onPincodeChange) onPincodeChange(resolvedPin);
    }

    // Collect all available unique PINs for this city if multiple
    const matchingPins = Array.from(
      new Set(results.filter((r) => r.district === item.district || r.city === item.city).map((r) => r.pincode))
    ).filter(Boolean);

    setAvailablePins(matchingPins);
    setSearchTerm(`${resolvedCity}, ${resolvedState}`);
    setOpen(false);
  };

  // Direct PIN Code input blur/change auto-resolution
  const handlePincodeBlur = async (e) => {
    const val = e.target.value.trim();
    if (/^\d{6}$/.test(val) && (!city || !state)) {
      try {
        const res = await api.get(`/location/pincode/${val}`);
        if (res.data && res.data.state) {
          const resolvedCity = res.data.city || res.data.district || "";
          const resolvedState = res.data.state || "";
          if (onChange) {
            onChange({ city: resolvedCity, state: resolvedState, pincode: val });
          } else {
            if (onCityChange) onCityChange(resolvedCity);
            if (onStateChange) onStateChange(resolvedState);
            if (onPincodeChange) onPincodeChange(val);
          }
        }
      } catch (e) {}
    }
  };

  const bgInputClass = dark
    ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500"
    : "bg-white border-slate-200 text-slate-900 focus:border-blue-600";

  return (
    <div ref={wrapperRef} className={`space-y-3 ${className}`}>
      {/* SEARCH / AUTOCOMPLETE CONTROL */}
      <div className="relative">
        <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"} flex items-center justify-between`}>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-blue-500" /> Search Location / City / PIN
          </span>
          {apiError && <span className="text-[10px] text-amber-500 font-normal">Manual entry mode active</span>}
        </Label>
        <div className="relative mt-1">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            placeholder="Type City or PIN (e.g. Ichalkaranji, 416115)..."
            className={`text-xs h-9 pr-8 font-medium ${bgInputClass}`}
          />
          <div className="absolute right-2.5 top-2.5 text-slate-400">
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Search className="w-4 h-4" />}
          </div>
        </div>

        {/* DROPDOWN RESULTS MENU */}
        {open && results.length > 0 && (
          <div className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl shadow-xl border overflow-hidden max-h-60 overflow-y-auto ${
            dark ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b ${
              dark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-100 text-slate-500"
            }`}>
              Select Location ({results.length} matches)
            </div>
            {results.map((r, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => selectLocation(r)}
                className={`w-full text-left px-3.5 py-2.5 text-xs transition-colors flex items-center justify-between border-b last:border-0 ${
                  dark ? "border-slate-800/60 hover:bg-slate-900" : "border-slate-100 hover:bg-blue-50/70"
                }`}
              >
                <div>
                  <div className="font-bold">{r.name}</div>
                  <div className={`text-[11px] ${dark ? "text-slate-400" : "text-slate-500"}`}>
                    {r.district ? `${r.district}, ` : ""}{r.state}
                  </div>
                </div>
                <div className="text-right font-mono font-semibold text-blue-500 text-xs">
                  {r.pincode}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* STRUCTURED CITY, STATE, PINCODE FIELDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"}`}>City *</Label>
          <Input
            value={city}
            onChange={(e) => {
              if (onChange) onChange({ city: e.target.value, state, pincode });
              else if (onCityChange) onCityChange(e.target.value);
            }}
            placeholder="City"
            required={required}
            className={`mt-1 text-xs h-9 ${bgInputClass}`}
          />
        </div>

        <div>
          <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"}`}>State *</Label>
          <Input
            value={state}
            onChange={(e) => {
              if (onChange) onChange({ city, state: e.target.value, pincode });
              else if (onStateChange) onStateChange(e.target.value);
            }}
            placeholder="State"
            required={required}
            className={`mt-1 text-xs h-9 ${bgInputClass}`}
          />
        </div>

        <div>
          <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"}`}>PIN Code *</Label>
          {availablePins.length > 1 ? (
            <select
              value={pincode}
              onChange={(e) => {
                const val = e.target.value;
                if (onChange) onChange({ city, state, pincode: val });
                else if (onPincodeChange) onPincodeChange(val);
              }}
              className={`mt-1 w-full text-xs h-9 rounded-md px-3 font-mono border ${bgInputClass}`}
            >
              <option value="">Select PIN</option>
              {availablePins.map((pin) => (
                <option key={pin} value={pin}>{pin}</option>
              ))}
            </select>
          ) : (
            <Input
              value={pincode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                if (onChange) onChange({ city, state, pincode: val });
                else if (onPincodeChange) onPincodeChange(val);
              }}
              onBlur={handlePincodeBlur}
              placeholder="6-digit PIN"
              maxLength={6}
              required={required}
              className={`mt-1 text-xs h-9 font-mono ${bgInputClass}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
