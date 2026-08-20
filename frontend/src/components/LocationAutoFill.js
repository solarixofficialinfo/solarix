import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, MapPin, Loader2 } from "lucide-react";
import { searchLocations, getPlaceDetails, searchByPincode } from "@/lib/locationService";
import { resolveState } from "@/lib/indianStates";

export default function LocationAutoFill({
  city = "",
  state = "",
  pincode = "",
  district = "",
  latitude = null,
  longitude = null,
  landmark = "",
  onChange,
  onCityChange,
  onStateChange,
  onPincodeChange,
  onDistrictChange,
  onCoordinatesChange,
  required = false,
  className = "",
  dark = false,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [apiError, setApiError] = useState(false);

  const wrapperRef = useRef(null);
  const latestRequestId = useRef(0);

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

  // Debounced place / location search (300ms) with stale request cancellation
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term || term.length < 2) {
      setResults([]);
      setApiError(false);
      return;
    }

    const requestId = ++latestRequestId.current;

    const timer = setTimeout(async () => {
      setLoading(true);
      setApiError(false);
      try {
        const matches = await searchLocations(term);
        if (requestId === latestRequestId.current) {
          setResults(matches || []);
          if (matches && matches.length > 0) {
            setOpen(true);
          } else {
            setApiError(true);
          }
        }
      } catch (err) {
        if (requestId === latestRequestId.current) {
          console.warn("Location search error:", err);
          setApiError(true);
          setResults([]);
        }
      } finally {
        if (requestId === latestRequestId.current) {
          setLoading(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Handle selection from dropdown
  const selectLocation = async (item) => {
    setOpen(false);
    setLoading(true);

    try {
      // Resolve full details
      const details = await getPlaceDetails(item);
      const resCity = details?.city || item.city || item.name || "";
      const resState = details?.state || item.state || "";
      const resPin = details?.pincode || item.pincode || "";
      const resDistrict = details?.district || item.district || "";
      const resLat = details?.latitude ?? latitude;
      const resLng = details?.longitude ?? longitude;
      const resAddr = details?.address || "";
      const resLandmark = details?.landmark || landmark;

      // Update parent component
      emitChange({
        city: resCity,
        state: resState,
        pincode: resPin,
        district: resDistrict,
        latitude: resLat,
        longitude: resLng,
        address: resAddr,
        landmark: resLandmark,
      });

      setSearchTerm(`${resCity}${resState ? `, ${resState}` : ""}`);
    } catch (e) {
      // Fallback direct assignment without breaking
      const resCity = item.city || item.name || "";
      const resState = item.state || "";
      const resPin = item.pincode || "";
      const resDistrict = item.district || "";

      emitChange({
        city: resCity,
        state: resState,
        pincode: resPin,
        district: resDistrict,
        latitude,
        longitude,
      });

      setSearchTerm(`${resCity}${resState ? `, ${resState}` : ""}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper to trigger all registered parent change handlers safely
  const emitChange = (data) => {
    if (onChange) {
      onChange(data);
    }
    if (onCityChange && data.city !== undefined) onCityChange(data.city);
    if (onStateChange && data.state !== undefined) onStateChange(data.state);
    if (onPincodeChange && data.pincode !== undefined) onPincodeChange(data.pincode);
    if (onDistrictChange && data.district !== undefined) onDistrictChange(data.district);
    if (onCoordinatesChange && (data.latitude !== undefined || data.longitude !== undefined)) {
      onCoordinatesChange(data.latitude, data.longitude);
    }
  };

  // 6-Digit PIN Code Direct Change Handler
  const handlePincodeChange = async (val) => {
    const cleanPin = val.replace(/\D/g, "").slice(0, 6);
    emitChange({ city, state, pincode: cleanPin, district, latitude, longitude });

    if (cleanPin.length === 6) {
      try {
        const matches = await searchByPincode(cleanPin);
        if (matches && matches.length > 0) {
          const first = matches[0];
          emitChange({
            city: first.city || first.name,
            state: first.state || state,
            pincode: cleanPin,
            district: first.district || district,
            latitude,
            longitude,
          });
        }
      } catch (e) {}
    }
  };

  // State code / alias normalization on state blur
  const handleStateBlur = (e) => {
    const val = e.target.value;
    if (val) {
      const resolved = resolveState(val);
      if (resolved) {
        emitChange({ city, state: resolved.name, pincode, district, latitude, longitude });
      }
    }
  };

  const bgInputClass = dark
    ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500"
    : "bg-white border-slate-200 text-slate-900 focus:border-blue-600";

  return (
    <div ref={wrapperRef} className={`space-y-3 ${className}`}>
      {/* SEARCH / AUTOCOMPLETE EXPERIENCE */}
      <div className="relative">
        <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"} flex items-center gap-1 mb-1`}>
          <MapPin className="w-3.5 h-3.5 text-blue-500" /> Search Location / City / PIN / State
        </Label>

        <div className="relative">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            placeholder="Search city, village, locality or PIN code"
            className={`text-xs h-9 pr-8 font-medium ${bgInputClass}`}
          />
          <div className="absolute right-2.5 top-2.5 text-slate-400">
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Search className="w-4 h-4" />}
          </div>
        </div>

        {/* DROPDOWN SEARCH RESULTS MENU */}
        {open && results.length > 0 && (
          <div className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl shadow-2xl border overflow-hidden max-h-64 overflow-y-auto ${
            dark ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
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
                  <div className="font-bold flex items-center gap-1.5 text-slate-900 dark:text-white">
                    {r.name}
                    {r.type && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                        r.type === "State"
                          ? "bg-purple-100 text-purple-700"
                          : r.type === "District"
                          ? "bg-amber-100 text-amber-800"
                          : r.type === "City"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {r.type}
                      </span>
                    )}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${dark ? "text-slate-400" : "text-slate-500"}`}>
                    {r.secondary || [r.district, r.state].filter(Boolean).join(", ") + (r.pincode ? ` • ${r.pincode}` : "")}
                  </div>
                </div>

                {r.pincode && (
                  <div className="text-right font-mono font-semibold text-blue-600 text-xs ml-2 shrink-0">
                    {r.pincode}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* API ERROR / FALLBACK NOTICE */}
        {apiError && !loading && searchTerm.trim().length >= 2 && results.length === 0 && (
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 italic">
            Unable to find this location. You can enter the address manually below.
          </div>
        )}
      </div>

      {/* STRUCTURED CITY, DISTRICT, STATE, PINCODE FIELDS */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"}`}>City / Locality *</Label>
          <Input
            value={city}
            onChange={(e) => emitChange({ city: e.target.value, state, pincode, district, latitude, longitude })}
            placeholder="City or Town"
            required={required}
            className={`mt-1 text-xs h-9 ${bgInputClass}`}
          />
        </div>

        <div>
          <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"}`}>District</Label>
          <Input
            value={district}
            onChange={(e) => emitChange({ city, state, pincode, district: e.target.value, latitude, longitude })}
            placeholder="District"
            className={`mt-1 text-xs h-9 ${bgInputClass}`}
          />
        </div>

        <div>
          <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"}`}>State *</Label>
          <Input
            value={state}
            onChange={(e) => emitChange({ city, state: e.target.value, pincode, district, latitude, longitude })}
            onBlur={handleStateBlur}
            placeholder="State (e.g. Maharashtra or MH)"
            required={required}
            className={`mt-1 text-xs h-9 ${bgInputClass}`}
          />
        </div>

        <div>
          <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"}`}>PIN Code *</Label>
          <Input
            value={pincode}
            onChange={(e) => handlePincodeChange(e.target.value)}
            placeholder="6-digit PIN"
            maxLength={6}
            required={required}
            className={`mt-1 text-xs h-9 font-mono ${bgInputClass}`}
          />
        </div>
      </div>
    </div>
  );
}
