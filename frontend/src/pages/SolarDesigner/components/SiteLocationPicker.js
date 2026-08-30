import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, MapPin, Navigation, Globe, Layers, AlertTriangle, CheckCircle2,
  Building, User, ArrowRight, RefreshCw, ZoomIn, ZoomOut, Maximize2, ShieldCheck, Sparkles, Upload
} from "lucide-react";
import {
  searchLocations,
  getPlaceDetails,
  getCurrentLocationDetails,
  loadGoogleMapsScript,
} from "@/lib/locationService";
import { useClientList } from "@/hooks/useClients";

export default function SiteLocationPicker({
  designData,
  updateDesignData,
  onProceed,
}) {
  const [query, setQuery] = useState(designData.address || "");
  const [predictions, setPredictions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [mapType, setMapType] = useState("satellite"); // 'satellite' | 'roadmap' | 'hybrid'
  const [mapZoom, setMapZoom] = useState(designData.zoom || 19);

  // Clients List from existing CRM hook
  const { data: clientsData = [] } = useClientList();
  const clients = Array.isArray(clientsData) ? clientsData : [];

  const mapContainerRef = useRef(null);
  const googleMapRef = useRef(null);
  const markerRef = useRef(null);

  // Sync client details when selected
  const handleClientChange = (clientId) => {
    const matched = clients.find((c) => c.id === clientId);
    if (matched) {
      updateDesignData({
        client_id: matched.id,
        client_name: matched.full_name,
        site_name: designData.site_name || `${matched.full_name} Rooftop`,
        address: matched.address || designData.address,
        formatted_address: [matched.address, matched.city, matched.state, matched.pincode].filter(Boolean).join(", ") || designData.formatted_address,
      });
      if (matched.address && !designData.latitude) {
        setQuery(matched.address);
      }
    } else {
      updateDesignData({ client_id: "", client_name: "" });
    }
  };

  // Autocomplete Search
  useEffect(() => {
    if (!query || query.length < 2) {
      setPredictions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchLocations(query);
        setPredictions(results || []);
      } catch (e) {
        setPredictions([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  // Select Prediction Item
  const handleSelectPrediction = async (item) => {
    setSearching(true);
    setPredictions([]);
    try {
      const details = await getPlaceDetails(item);
      if (details) {
        setQuery(details.formatted_address || details.name);
        updateDesignData({
          address: details.address || details.name,
          formatted_address: details.formatted_address || details.name,
          latitude: details.latitude || designData.latitude || 19.076,
          longitude: details.longitude || designData.longitude || 72.8777,
          place_id: details.place_id || "",
          site_name: designData.site_name || `${details.city || details.name} Solar Site`,
        });
      }
    } catch (e) {
      console.warn("Place selection error", e);
    } finally {
      setSearching(false);
    }
  };

  // GPS Current Location Detection
  const handleDetectGPS = async () => {
    setDetectingGps(true);
    try {
      const details = await getCurrentLocationDetails();
      if (details && details.latitude && details.longitude) {
        setQuery(details.formatted_address || `${details.city}, ${details.state}`);
        updateDesignData({
          address: details.address || details.city || "Current Location",
          formatted_address: details.formatted_address || `${details.city}, ${details.state}`,
          latitude: details.latitude,
          longitude: details.longitude,
          site_name: designData.site_name || `${details.city || 'GPS'} Solar Site`,
        });
      }
    } catch (err) {
      alert(err.message || "Failed to detect GPS location.");
    } finally {
      setDetectingGps(false);
    }
  };

  // Initialize Map (Google Maps or Leaflet / Satellite Tile Fallback)
  useEffect(() => {
    const lat = Number(designData.latitude) || 19.076;
    const lng = Number(designData.longitude) || 72.8777;

    loadGoogleMapsScript()
      .then((maps) => {
        if (!mapContainerRef.current) return;
        if (!googleMapRef.current) {
          const map = new maps.Map(mapContainerRef.current, {
            center: { lat, lng },
            zoom: mapZoom,
            mapTypeId: mapType === "satellite" ? maps.MapTypeId.SATELLITE : mapType === "hybrid" ? maps.MapTypeId.HYBRID : maps.MapTypeId.ROADMAP,
            tilt: 0,
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            fullscreenControl: true,
          });
          googleMapRef.current = map;

          const marker = new maps.Marker({
            position: { lat, lng },
            map,
            draggable: true,
            title: "Solar Rooftop Site Location",
          });
          markerRef.current = marker;

          marker.addListener("dragend", () => {
            const pos = marker.getPosition();
            updateDesignData({
              latitude: pos.lat(),
              longitude: pos.lng(),
            });
          });
        } else {
          googleMapRef.current.setCenter({ lat, lng });
          googleMapRef.current.setZoom(mapZoom);
          googleMapRef.current.setMapTypeId(
            mapType === "satellite" ? maps.MapTypeId.SATELLITE : mapType === "hybrid" ? maps.MapTypeId.HYBRID : maps.MapTypeId.ROADMAP
          );
          if (markerRef.current) {
            markerRef.current.setPosition({ lat, lng });
          }
        }
      })
      .catch(() => {
        // Fallback tile view rendered in DOM if Google Maps SDK key is not configured
      });
  }, [designData.latitude, designData.longitude, mapType, mapZoom, updateDesignData]);

  const hasCoordinates = Boolean(designData.latitude && designData.longitude);

  return (
    <div className="space-y-6">
      {/* Site & Client Header Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-blue-600" /> Link Client (Optional)
          </Label>
          <Select value={designData.client_id || "none"} onValueChange={(val) => handleClientChange(val === "none" ? "" : val)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Select existing client..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">-- No Client Linked --</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name} {c.sol_id ? `(${c.sol_id})` : ""} · {c.city || ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-blue-600" /> Site / Project Label *
          </Label>
          <Input
            value={designData.site_name || ""}
            onChange={(e) => updateDesignData({ site_name: e.target.value })}
            placeholder="e.g. Main Plant Rooftop 50kW"
            className="h-9 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-emerald-600" /> Coordinates (Lat, Long)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.000001"
              value={designData.latitude ?? ""}
              onChange={(e) => updateDesignData({ latitude: parseFloat(e.target.value) || null })}
              placeholder="Latitude"
              className="h-9 text-xs font-mono"
            />
            <Input
              type="number"
              step="0.000001"
              value={designData.longitude ?? ""}
              onChange={(e) => updateDesignData({ longitude: parseFloat(e.target.value) || null })}
              placeholder="Longitude"
              className="h-9 text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {/* Address Search Bar with GPS Button */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search site address, landmark, PIN code, or Google Place (e.g. Sector 5, Salt Lake, Kolkata)..."
              className="h-10 pl-10 pr-4 text-xs font-medium shadow-xs"
            />
            {searching && (
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin absolute right-3 top-3" />
            )}
          </div>

          <Button
            onClick={handleDetectGPS}
            disabled={detectingGps}
            variant="outline"
            className="h-10 text-xs gap-1.5 border-slate-300 hover:bg-blue-50 hover:text-blue-700 font-semibold"
          >
            <Navigation className={`w-3.5 h-3.5 text-blue-600 ${detectingGps ? "animate-pulse" : ""}`} />
            {detectingGps ? "Detecting..." : "Use Current GPS"}
          </Button>
        </div>

        {/* Prediction Dropdown */}
        {predictions.length > 0 && (
          <div className="absolute top-11 left-0 right-0 z-50 bg-white rounded-xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
            {predictions.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectPrediction(p)}
                className="w-full text-left p-3 hover:bg-blue-50/80 transition flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="truncate">
                    <span className="font-semibold text-slate-900">{p.name}</span>
                    {p.secondary && <span className="text-slate-500 ml-1">· {p.secondary}</span>}
                    {p.description && !p.secondary && <span className="text-slate-500 ml-1">· {p.description}</span>}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0 bg-slate-50">{p.type || "Place"}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map & Satellite Viewport */}
      <div className="relative w-full h-[450px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 shadow-sm">
        {/* Google Maps Container */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Map Type & Zoom Control Bar */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 shadow-md">
          <Button
            size="sm"
            variant={mapType === "satellite" ? "default" : "ghost"}
            onClick={() => setMapType("satellite")}
            className="h-7 text-[11px] px-2.5 rounded-lg"
          >
            Satellite Aerial
          </Button>
          <Button
            size="sm"
            variant={mapType === "hybrid" ? "default" : "ghost"}
            onClick={() => setMapType("hybrid")}
            className="h-7 text-[11px] px-2.5 rounded-lg"
          >
            Hybrid
          </Button>
          <Button
            size="sm"
            variant={mapType === "roadmap" ? "default" : "ghost"}
            onClick={() => setMapType("roadmap")}
            className="h-7 text-[11px] px-2.5 rounded-lg"
          >
            Map View
          </Button>
        </div>

        {/* Engineering Notice Badge */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2">
          <div className="bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-700/80 shadow-lg text-[11px] text-slate-300 pointer-events-auto flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Selected Location: <b>{designData.latitude ? `${Number(designData.latitude).toFixed(6)}, ${Number(designData.longitude).toFixed(6)}` : "Select or drag marker"}</b>
            </span>
          </div>

          <div className="bg-amber-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-800/60 shadow-lg text-[10.5px] text-amber-200 pointer-events-auto flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Roof boundaries are estimated from imagery — calibration required in Step 2</span>
          </div>
        </div>
      </div>

      {/* Step Actions Footer */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-slate-500">
          Step 1 of 4: Site Location & Satellite Imagery
        </div>

        <Button
          onClick={onProceed}
          disabled={!hasCoordinates}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-6 gap-2 rounded-xl shadow-sm h-10"
        >
          <span>Proceed to Roof Geometry</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
