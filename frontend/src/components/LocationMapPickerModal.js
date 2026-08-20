import React, { useState, useEffect, useRef } from "react";
import { loadGoogleMapsScript, reverseGeocode, searchLocations, getPlaceDetails } from "@/lib/locationService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Navigation, Layers, Loader2, Search, Check, X, Satellite, Compass } from "lucide-react";
import { toast } from "sonner";

// Default map center (India center if no coordinates provided: Nagpur / India default 20.5937, 78.9629)
const DEFAULT_CENTER = { lat: 16.705, lng: 74.2433 }; // Kolhapur, MH default center for region

export default function LocationMapPickerModal({
  isOpen,
  onClose,
  initialLat = null,
  initialLng = null,
  initialAddress = "",
  initialCity = "",
  initialState = "",
  initialPincode = "",
  onConfirm,
  dark = false,
}) {
  const mapRef = useRef(null);
  const googleMapInstanceRef = useRef(null);
  const markerInstanceRef = useRef(null);

  const [mapType, setMapType] = useState("roadmap"); // "roadmap" | "satellite" | "hybrid"
  const [selectedCoords, setSelectedCoords] = useState(() => ({
    lat: initialLat ? Number(initialLat) : DEFAULT_CENTER.lat,
    lng: initialLng ? Number(initialLng) : DEFAULT_CENTER.lng,
  }));

  const [locationDetails, setLocationDetails] = useState({
    address: initialAddress || "",
    city: initialCity || "",
    state: initialState || "",
    pincode: initialPincode || "",
    district: "",
    state_code: "",
    formatted_address: "",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [usingFallbackMap, setUsingFallbackMap] = useState(false);

  // Initialize Map when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const startLat = initialLat ? Number(initialLat) : DEFAULT_CENTER.lat;
    const startLng = initialLng ? Number(initialLng) : DEFAULT_CENTER.lng;
    const center = { lat: startLat, lng: startLng };

    setSelectedCoords(center);

    loadGoogleMapsScript()
      .then((maps) => {
        if (!isMounted || !mapRef.current) return;
        setUsingFallbackMap(false);

        const mapOptions = {
          center: center,
          zoom: initialLat ? 16 : 12,
          mapTypeId: mapType,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        };

        const map = new maps.Map(mapRef.current, mapOptions);
        googleMapInstanceRef.current = map;

        const marker = new maps.Marker({
          position: center,
          map: map,
          draggable: true,
          title: "Drag to set exact location",
          animation: maps.Animation.DROP,
        });
        markerInstanceRef.current = marker;

        // Handle Marker Drag End
        marker.addListener("dragend", async () => {
          const pos = marker.getPosition();
          const lat = pos.lat();
          const lng = pos.lng();
          setSelectedCoords({ lat, lng });
          await handleReverseGeocode(lat, lng);
        });

        // Handle Click on Map
        map.addListener("click", async (e) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          marker.setPosition({ lat, lng });
          setSelectedCoords({ lat, lng });
          await handleReverseGeocode(lat, lng);
        });

        // Initial reverse geocode if no city provided
        if (!initialCity) {
          handleReverseGeocode(startLat, startLng);
        }
      })
      .catch((err) => {
        console.warn("Google Maps SDK not loaded, enabling interactive fallback map mode", err);
        setUsingFallbackMap(true);
        if (!initialCity) handleReverseGeocode(startLat, startLng);
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Update map type (Roadmap, Satellite, Hybrid)
  useEffect(() => {
    if (googleMapInstanceRef.current) {
      googleMapInstanceRef.current.setMapTypeId(mapType);
    }
  }, [mapType]);

  // Reverse Geocode helper
  const handleReverseGeocode = async (lat, lng) => {
    setIsGeocoding(true);
    try {
      const res = await reverseGeocode(lat, lng);
      if (res) {
        setLocationDetails((prev) => ({
          ...prev,
          city: res.city || prev.city,
          district: res.district || prev.district,
          state: res.state || prev.state,
          state_code: res.state_code || prev.state_code,
          pincode: res.pincode || prev.pincode,
          address: res.address || prev.address,
          formatted_address: res.formatted_address || prev.formatted_address,
        }));
      }
    } catch (e) {
      console.warn("Reverse geocode error:", e);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Search location within map modal
  const handleSearchSubmit = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchLocations(searchQuery);
      setSearchResults(results);
    } catch (err) {
      toast.error("Location search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = async (item) => {
    setSearchResults([]);
    setSearchQuery(item.name || item.description || "");
    setIsSearching(true);

    try {
      const details = await getPlaceDetails(item);
      if (details) {
        const lat = details.latitude ?? selectedCoords.lat;
        const lng = details.longitude ?? selectedCoords.lng;

        setSelectedCoords({ lat, lng });
        setLocationDetails((prev) => ({
          ...prev,
          city: details.city || item.city || prev.city,
          district: details.district || item.district || prev.district,
          state: details.state || item.state || prev.state,
          state_code: details.state_code || prev.state_code,
          pincode: details.pincode || item.pincode || prev.pincode,
          address: details.address || prev.address,
          formatted_address: details.formatted_address || prev.formatted_address,
        }));

        if (googleMapInstanceRef.current && markerInstanceRef.current) {
          const pos = { lat, lng };
          googleMapInstanceRef.current.setCenter(pos);
          googleMapInstanceRef.current.setZoom(16);
          markerInstanceRef.current.setPosition(pos);
        }
      }
    } catch (err) {
      toast.error("Could not fetch location details");
    } finally {
      setIsSearching(false);
    }
  };

  // "Use my current location" GPS button
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setSelectedCoords({ lat, lng });

        if (googleMapInstanceRef.current && markerInstanceRef.current) {
          const pos = { lat, lng };
          googleMapInstanceRef.current.setCenter(pos);
          googleMapInstanceRef.current.setZoom(17);
          markerInstanceRef.current.setPosition(pos);
        }

        await handleReverseGeocode(lat, lng);
        setIsLocating(false);
        toast.success("Location set to your current GPS position");
      },
      (error) => {
        setIsLocating(false);
        console.warn("GPS error:", error);
        toast.error("Could not fetch device GPS position. Please allow location permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Confirm selection
  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm({
        latitude: Number(selectedCoords.lat.toFixed(6)),
        longitude: Number(selectedCoords.lng.toFixed(6)),
        city: locationDetails.city,
        state: locationDetails.state,
        state_code: locationDetails.state_code,
        pincode: locationDetails.pincode,
        district: locationDetails.district,
        address: locationDetails.address,
        formatted_address: locationDetails.formatted_address,
      });
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-4xl w-[95vw] max-h-[90vh] p-0 overflow-hidden flex flex-col ${
        dark ? "bg-slate-950 text-white border-slate-800" : "bg-white text-slate-900"
      }`}>
        <DialogHeader className="px-4 py-3 border-b border-slate-200 flex flex-row items-center justify-between">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600 animate-bounce" />
            Pick Exact Location on Map
          </DialogTitle>
          <div className="text-xs text-slate-500 font-mono">
            {selectedCoords.lat.toFixed(5)}, {selectedCoords.lng.toFixed(5)}
          </div>
        </DialogHeader>

        {/* MAP TOOLBAR & SEARCH */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-2 items-center justify-between">
          {/* Map Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search address, landmark, town or village on map..."
              className="h-9 text-xs pr-8 bg-white border-slate-300"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-2 top-2 text-slate-400 hover:text-blue-600"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>

            {/* Search Dropdown overlay */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg shadow-xl border bg-white max-h-48 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectSearchResult(r)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b last:border-0 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{r.name}</div>
                      <div className="text-[11px] text-slate-500">{r.secondary || r.district || r.state}</div>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                      {r.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>

          {/* Controls: MAP TYPE TOGGLE & GPS */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
            <div className="bg-slate-200 p-0.5 rounded-lg flex items-center text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMapType("roadmap")}
                className={`px-2.5 py-1 rounded-md transition ${mapType === "roadmap" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
              >
                Roadmap
              </button>
              <button
                type="button"
                onClick={() => setMapType("satellite")}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${mapType === "satellite" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
              >
                <Satellite className="w-3 h-3" /> Satellite
              </button>
              <button
                type="button"
                onClick={() => setMapType("hybrid")}
                className={`px-2.5 py-1 rounded-md transition ${mapType === "hybrid" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
              >
                Hybrid
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="h-8 text-xs gap-1 border-slate-300 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              {isLocating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5 text-blue-600" />}
              <span className="hidden xs:inline">Current GPS</span>
            </Button>
          </div>
        </div>

        {/* INTERACTIVE MAP CONTAINER */}
        <div className="relative flex-1 min-h-[320px] sm:min-h-[400px] w-full bg-slate-100">
          <div ref={mapRef} className="w-full h-full min-h-[320px] sm:min-h-[400px]" />

          {/* FALLBACK INTERACTIVE TILE VIEW (If Google SDK is disabled) */}
          {usingFallbackMap && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900/90 text-white text-center">
              <Compass className="w-12 h-12 text-blue-400 mb-2 animate-pulse" />
              <div className="font-bold text-sm">Interactive GPS Coordinate Selection</div>
              <p className="text-xs text-slate-300 max-w-sm mt-1 mb-3">
                Drag or click below to refine coordinates for reverse geocoding.
              </p>
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 font-mono text-xs text-emerald-400">
                Lat: {selectedCoords.lat.toFixed(6)} | Lng: {selectedCoords.lng.toFixed(6)}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  onClick={handleUseCurrentLocation}
                  className="bg-blue-600 hover:bg-blue-700 text-xs"
                >
                  <Navigation className="w-3.5 h-3.5 mr-1" /> Fetch Device GPS
                </Button>
              </div>
            </div>
          )}

          {/* REVERSE GEOCODING READOUT BADGE */}
          {isGeocoding && (
            <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-xs text-slate-800 px-3 py-1.5 rounded-lg text-xs shadow-lg flex items-center gap-2 border border-slate-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> Resolving address details...
            </div>
          )}
        </div>

        {/* SELECTED LOCATION ADDRESS READOUT PANEL */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">City / Locality</span>
            <div className="font-semibold text-slate-900 truncate">{locationDetails.city || "—"}</div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">District</span>
            <div className="font-semibold text-slate-900 truncate">{locationDetails.district || "—"}</div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">State</span>
            <div className="font-semibold text-slate-900 truncate">{locationDetails.state || "—"}</div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">PIN Code</span>
            <div className="font-mono font-semibold text-blue-600">{locationDetails.pincode || "—"}</div>
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t border-slate-200 bg-white flex flex-row items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            <X className="w-3.5 h-3.5 mr-1" /> Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700 text-xs gap-1.5">
            <Check className="w-4 h-4" /> Confirm Selected Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
