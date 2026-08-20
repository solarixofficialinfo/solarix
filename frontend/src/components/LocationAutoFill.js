import React, { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Loader2, Map, Check, ChevronDown, Compass, Globe } from "lucide-react";
import LocationMapPickerModal from "./LocationMapPickerModal";
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
  const [availableLocalities, setAvailableLocalities] = useState([]);
  const [apiError, setApiError] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

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

  // Debounced place / location search
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term || term.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setApiError(false);
      try {
        const matches = await searchLocations(term);
        setResults(matches || []);
        if (matches && matches.length > 0) {
          setOpen(true);
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

  // 6-Digit PIN Code Blur / Multi-Locality Handler
  const handlePincodeChange = async (val) => {
    const cleanPin = val.replace(/\D/g, "").slice(0, 6);
    emitChange({ city, state, pincode: cleanPin, district, latitude, longitude });

    if (cleanPin.length === 6) {
      try {
        const matches = await searchByPincode(cleanPin);
        if (matches && matches.length > 0) {
          setAvailableLocalities(matches);
          // If only 1 locality match, auto populate
          if (matches.length === 1) {
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
        }
      } catch (e) {}
    } else {
      setAvailableLocalities([]);
    }
  };

  // Select locality from PIN dropdown
  const handleLocalitySelect = (localityName) => {
    const found = availableLocalities.find((l) => l.name === localityName || l.city === localityName);
    if (found) {
      emitChange({
        city: found.city || found.name,
        state: found.state || state,
        pincode: pincode,
        district: found.district || district,
        latitude,
        longitude,
      });
    }
  };

  // State code / alias normalization on state blur/change
  const handleStateBlur = (e) => {
    const val = e.target.value;
    if (val) {
      const resolved = resolveState(val);
      if (resolved) {
        emitChange({ city, state: resolved.name, pincode, district, latitude, longitude });
      }
    }
  };

  // Map Picker Modal confirm handler
  const handleMapConfirm = (coordsData) => {
    emitChange({
      city: coordsData.city || city,
      state: coordsData.state || state,
      pincode: coordsData.pincode || pincode,
      district: coordsData.district || district,
      address: coordsData.address,
      landmark: coordsData.landmark,
      latitude: coordsData.latitude,
      longitude: coordsData.longitude,
    });
  };

  const bgInputClass = dark
    ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500"
    : "bg-white border-slate-200 text-slate-900 focus:border-blue-600";

  return (
    <div ref={wrapperRef} className={`space-y-3 ${className}`}>
      {/* SEARCH / AUTOCOMPLETE & MAP PICKER ACTION */}
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <Label className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"} flex items-center gap-1`}>
            <MapPin className="w-3.5 h-3.5 text-blue-500" /> Search Location / City / PIN / State
          </Label>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsMapModalOpen(true)}
            className="h-7 px-2.5 text-[11px] font-semibold border-blue-300 text-blue-700 hover:bg-blue-50 gap-1"
          >
            <Map className="w-3.5 h-3.5 text-blue-600" /> Pick Exact Location on Map
          </Button>
        </div>

        <div className="relative">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            placeholder="Type City, Town, Village, State or PIN (e.g. MH, Kolhapur, 416115)..."
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
            <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b flex items-center justify-between ${
              dark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-100 text-slate-500"
            }`}>
              <span>Matching Locations ({results.length})</span>
              <span className="text-[9px] font-normal text-slate-400">Select to populate</span>
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
                  <div className="font-bold flex items-center gap-1.5">
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
                    {r.secondary || (r.district ? `${r.district}, ` : "") + r.state}
                  </div>
                </div>

                {r.pincode && (
                  <div className="text-right font-mono font-semibold text-blue-500 text-xs">
                    {r.pincode}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MULTI-LOCALITY PICKER FOR SHARED PIN CODES */}
      {availableLocalities.length > 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs space-y-1">
          <div className="font-semibold text-amber-900 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-amber-600" />
            Multiple Localities / Post Offices found for PIN {pincode}:
          </div>
          <select
            onChange={(e) => handleLocalitySelect(e.target.value)}
            className="w-full text-xs h-8 rounded-md px-2 bg-white border border-amber-300 font-medium"
          >
            <option value="">Select Local Post Office / Village...</option>
            {availableLocalities.map((loc, i) => (
              <option key={i} value={loc.city || loc.name}>
                {loc.name} {loc.district ? `(${loc.district})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* LATITUDE & LONGITUDE PREVIEW BADGE */}
      {(latitude || longitude) && (
        <div className="flex items-center gap-2 text-[11px] font-mono bg-blue-50 text-blue-800 px-2.5 py-1 rounded-md border border-blue-200 w-fit">
          <Globe className="w-3 h-3 text-blue-600" />
          <span>Coordinates: {latitude ? Number(latitude).toFixed(5) : "—"}, {longitude ? Number(longitude).toFixed(5) : "—"}</span>
        </div>
      )}

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

      {/* MAP PICKER MODAL */}
      <LocationMapPickerModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        initialLat={latitude}
        initialLng={longitude}
        initialCity={city}
        initialState={state}
        initialPincode={pincode}
        initialAddress={landmark}
        onConfirm={handleMapConfirm}
        dark={dark}
      />
    </div>
  );
}
