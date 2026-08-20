import { resolveState, searchStates } from "./indianStates";
import api from "./api";

// Dynamic Google Maps Script Loader
let googleMapsPromise = null;

export function loadGoogleMapsScript() {
  if (window.google && window.google.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (googleMapsPromise) return googleMapsPromise;

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error("No Google Maps API Key configured"));
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("google-maps-js-sdk");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google.maps));
      existing.addEventListener("error", (err) => reject(err));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-js-sdk";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      if (window.google && window.google.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps SDK load error"));
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

const locationSearchCache = new Map();

/**
 * Parses Google Place address components preserving locality/town/village over district.
 */
export function parseGoogleAddressComponents(components = []) {
  let locality = "";
  let sublocality = "";
  let neighborhood = "";
  let adminLevel3 = "";
  let district = "";
  let stateRaw = "";
  let pincode = "";
  let landmark = "";
  let route = "";
  let streetNumber = "";

  for (const comp of components) {
    const types = comp.types || [];
    if (types.includes("sublocality_level_1") || types.includes("sublocality")) {
      sublocality = comp.long_name;
    } else if (types.includes("locality")) {
      locality = comp.long_name;
    } else if (types.includes("neighborhood")) {
      neighborhood = comp.long_name;
    } else if (types.includes("administrative_area_level_3")) {
      adminLevel3 = comp.long_name;
    } else if (types.includes("administrative_area_level_2")) {
      district = comp.long_name;
    } else if (types.includes("administrative_area_level_1")) {
      stateRaw = comp.long_name;
    } else if (types.includes("postal_code")) {
      pincode = comp.long_name;
    } else if (types.includes("landmark")) {
      landmark = comp.long_name;
    } else if (types.includes("route")) {
      route = comp.long_name;
    } else if (types.includes("street_number")) {
      streetNumber = comp.long_name;
    }
  }

  // Priority for City field: sublocality -> locality -> neighborhood -> adminLevel3 -> district
  const city = sublocality || locality || neighborhood || adminLevel3 || district;
  const stateObj = resolveState(stateRaw) || { name: stateRaw, code: "" };
  const streetAddr = [streetNumber, route, landmark].filter(Boolean).join(", ");

  return {
    city: city || "",
    district: district || "",
    state: stateObj.name || stateRaw || "",
    state_code: stateObj.code || "",
    pincode: pincode || "",
    address: streetAddr || "",
    landmark: landmark || "",
  };
}

/**
 * Unified place autocomplete search (Google Places API + Indian Postal/States Fallback)
 */
export async function searchLocations(query) {
  const term = (query || "").trim();
  if (!term || term.length < 2) return [];

  if (locationSearchCache.has(term.toLowerCase())) {
    return locationSearchCache.get(term.toLowerCase());
  }

  // Check state search first
  const stateMatches = searchStates(term);

  // 1. PIN code search (6 digits)
  if (/^\d{6}$/.test(term)) {
    return await searchByPincode(term);
  }

  // 2. Try Google Places Autocomplete if available
  try {
    const maps = await loadGoogleMapsScript();
    if (maps && maps.places) {
      const autocompleteService = new maps.places.AutocompleteService();
      const predictions = await new Promise((resolve) => {
        autocompleteService.getPlacePredictions(
          {
            input: term,
            componentRestrictions: { country: "in" },
          },
          (results, status) => {
            if (status === maps.places.PlacesServiceStatus.OK && results) {
              resolve(results);
            } else {
              resolve([]);
            }
          }
        );
      });

      if (predictions && predictions.length > 0) {
        const placesResults = predictions.map((p) => {
          const types = p.types || [];
          let placeType = "Locality";
          if (types.includes("locality")) placeType = "City";
          else if (types.includes("administrative_area_level_2")) placeType = "District";
          else if (types.includes("administrative_area_level_1")) placeType = "State";
          else if (types.includes("postal_code")) placeType = "PIN Code";
          else if (types.includes("sublocality") || types.includes("neighborhood")) placeType = "Village/Locality";

          return {
            place_id: p.place_id,
            name: p.structured_formatting?.main_text || p.description.split(",")[0],
            secondary: p.structured_formatting?.secondary_text || "",
            description: p.description,
            type: placeType,
            source: "google",
          };
        });

        const finalResults = [...stateMatches, ...placesResults];
        locationSearchCache.set(term.toLowerCase(), finalResults);
        return finalResults;
      }
    }
  } catch (e) {
    // Google Maps SDK not available, use fallback
  }

  // 3. Fallback: Search via backend postal API
  try {
    const res = await api.get(`/location/city/${encodeURIComponent(term)}`);
    if (res.data && res.data.results && res.data.results.length > 0) {
      const postalResults = res.data.results.map((r) => ({
        name: r.name,
        city: r.name || r.city, // locality/post office name as city
        district: r.district,
        state: r.state,
        state_code: (resolveState(r.state) || {}).code || "",
        pincode: r.pincode,
        type: r.name === r.district ? "District" : "Town/Village",
        source: "postal",
      }));

      const finalResults = [...stateMatches, ...postalResults];
      locationSearchCache.set(term.toLowerCase(), finalResults);
      return finalResults;
    }
  } catch (err) {
    console.warn("Backend postal lookup failed, using direct fallback", err);
  }

  // 4. Direct Postal API Fallback
  try {
    const fallbackRes = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(term)}`)
      .then((r) => r.json())
      .catch(() => null);
    if (fallbackRes && fallbackRes[0]?.Status === "Success") {
      const mapped = (fallbackRes[0].PostOffice || []).map((po) => {
        const stateObj = resolveState(po.State) || { name: po.State, code: "" };
        return {
          name: po.Name,
          city: po.Name,
          district: po.District,
          state: stateObj.name,
          state_code: stateObj.code,
          pincode: po.Pincode,
          type: po.BranchType === "Sub Post Office" || po.BranchType === "Branch Post Office" ? "Village/Locality" : "Town",
          source: "postal",
        };
      });
      const finalResults = [...stateMatches, ...mapped];
      locationSearchCache.set(term.toLowerCase(), finalResults);
      return finalResults;
    }
  } catch (e) {}

  locationSearchCache.set(term.toLowerCase(), stateMatches);
  return stateMatches;
}

/**
 * Normalizes location details and resolves missing district or pincode via secondary postal lookup if required.
 */
export async function ensureDistrictAndPincode(locationObj) {
  if (!locationObj) return locationObj;

  let city = (locationObj.city || locationObj.name || "").trim();
  let district = (locationObj.district || locationObj.state_district || locationObj.county || locationObj.districtName || locationObj.admin_district || locationObj.administrative_area_level_2 || "").trim();
  let pincode = (locationObj.pincode || locationObj.postal_code || "").trim();
  let state = (locationObj.state || locationObj.administrative_area_level_1 || "").trim();

  // If district or pincode is missing and we have a city name, perform a quick postal lookup
  if ((!district || !pincode) && city && city.length >= 2) {
    try {
      const res = await api.get(`/location/city/${encodeURIComponent(city)}`);
      if (res.data?.results && res.data.results.length > 0) {
        let match = res.data.results[0];
        if (state) {
          const stateMatch = res.data.results.find(r => (r.state || "").toLowerCase().includes(state.toLowerCase()) || state.toLowerCase().includes((r.state || "").toLowerCase()));
          if (stateMatch) match = stateMatch;
        }
        if (!district && match.district) {
          district = match.district;
        }
        if (!pincode && match.pincode) {
          pincode = match.pincode;
        }
        if (!state && match.state) {
          const st = resolveState(match.state);
          state = st ? st.name : match.state;
        }
      }
    } catch (e) {
      console.warn("Secondary postal lookup error for", city, e);
    }
  }

  const stObj = resolveState(state) || { name: state, code: locationObj.state_code || "" };

  return {
    ...locationObj,
    city: city || "",
    district: district || "",
    state: stObj.name || state || "",
    state_code: stObj.code || locationObj.state_code || "",
    pincode: pincode || "",
  };
}

/**
 * Detailed Place Resolution (fetches full address components & lat/lng for a selected item)
 */
export async function getPlaceDetails(item) {
  if (!item) return null;

  // If state search result
  if (item.type === "State" && item.state) {
    const st = resolveState(item.state);
    return {
      name: st ? st.name : item.state,
      city: "",
      district: "",
      state: st ? st.name : item.state,
      state_code: st ? st.code : "",
      pincode: "",
      latitude: null,
      longitude: null,
    };
  }

  let result = null;

  // Google Place ID details resolution
  if (item.source === "google" && item.place_id) {
    try {
      const maps = await loadGoogleMapsScript();
      const dummyDiv = document.createElement("div");
      const placesService = new maps.places.PlacesService(dummyDiv);

      const place = await new Promise((resolve, reject) => {
        placesService.getDetails(
          {
            placeId: item.place_id,
            fields: ["address_components", "geometry", "formatted_address", "name"],
          },
          (res, status) => {
            if (status === maps.places.PlacesServiceStatus.OK && res) resolve(res);
            else reject(new Error("Place details error"));
          }
        );
      });

      const parsed = parseGoogleAddressComponents(place.address_components);
      const lat = place.geometry?.location?.lat() ?? null;
      const lng = place.geometry?.location?.lng() ?? null;

      result = {
        name: place.name || parsed.city || item.name,
        city: parsed.city || place.name || item.name,
        district: parsed.district,
        state: parsed.state,
        state_code: parsed.state_code,
        pincode: parsed.pincode,
        address: parsed.address,
        landmark: parsed.landmark,
        formatted_address: place.formatted_address || "",
        latitude: lat,
        longitude: lng,
      };
    } catch (e) {
      console.warn("Failed to get Google Place details, falling back", e);
    }
  }

  if (!result) {
    // Fallback for postal items
    const st = resolveState(item.state);
    result = {
      name: item.name || item.city,
      city: item.city || item.name,
      district: item.district || "",
      state: st ? st.name : (item.state || ""),
      state_code: st ? st.code : "",
      pincode: item.pincode || "",
      latitude: item.latitude || null,
      longitude: item.longitude || null,
    };
  }

  return await ensureDistrictAndPincode(result);
}

/**
 * Lookup by 6-digit PIN code. Returns list of post offices/localities under this PIN.
 */
export async function searchByPincode(pincode) {
  const code = (pincode || "").trim();
  if (!/^\d{6}$/.test(code)) return [];

  try {
    const res = await api.get(`/location/pincode/${code}`);
    if (res.data && res.data.state) {
      const poList = res.data.post_offices || [];
      const stateObj = resolveState(res.data.state) || { name: res.data.state, code: "" };
      
      if (poList.length > 0) {
        return poList.map((po) => ({
          name: po,
          city: po,
          district: res.data.district,
          state: stateObj.name,
          state_code: stateObj.code,
          pincode: code,
          type: "Post Office / Locality",
          source: "pincode",
        }));
      }
      return [
        {
          name: res.data.city || res.data.district || code,
          city: res.data.city || "",
          district: res.data.district || "",
          state: stateObj.name,
          state_code: stateObj.code,
          pincode: code,
          type: "PIN Area",
          source: "pincode",
        },
      ];
    }
  } catch (e) {
    console.warn("Pincode API lookup error", e);
  }

  // Direct fetch fallback
  try {
    const r = await fetch(`https://api.postalpincode.in/pincode/${code}`).then((res) => res.json());
    if (r && r[0]?.Status === "Success") {
      const poList = r[0].PostOffice || [];
      return poList.map((po) => {
        const stateObj = resolveState(po.State) || { name: po.State, code: "" };
        return {
          name: po.Name,
          city: po.Name,
          district: po.District,
          state: stateObj.name,
          state_code: stateObj.code,
          pincode: code,
          type: "Post Office / Locality",
          source: "pincode",
        };
      });
    }
  } catch (err) {}

  return [];
}

/**
 * Reverse Geocode coordinates (lat, lng) -> Address components
 */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;

  // 1. Try Google Geocoder if available
  try {
    const maps = await loadGoogleMapsScript();
    if (maps && maps.Geocoder) {
      const geocoder = new maps.Geocoder();
      const response = await new Promise((resolve, reject) => {
        geocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, (results, status) => {
          if (status === "OK" && results && results[0]) resolve(results[0]);
          else reject(new Error("Geocoder failed"));
        });
      });

      const parsed = parseGoogleAddressComponents(response.address_components);
      return {
        ...parsed,
        formatted_address: response.formatted_address || "",
        latitude: Number(lat),
        longitude: Number(lng),
      };
    }
  } catch (e) {
    console.warn("Google reverse geocoding unavailable, trying Nominatim fallback", e);
  }

  // 2. Nominatim OpenStreetMap fallback
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const data = await fetch(url, { headers: { "Accept-Language": "en" } }).then((r) => r.json());
    if (data && data.address) {
      const addr = data.address;
      const city = addr.village || addr.town || addr.suburb || addr.city || addr.county || "";
      const district = addr.state_district || addr.county || addr.district || "";
      const stateRaw = addr.state || "";
      const stateObj = resolveState(stateRaw) || { name: stateRaw, code: "" };
      const pincode = addr.postcode || "";
      const street = [addr.road, addr.house_number, addr.suburb].filter(Boolean).join(", ");

      return {
        city: city,
        district: district,
        state: stateObj.name || stateRaw,
        state_code: stateObj.code || "",
        pincode: pincode,
        address: street || data.display_name.split(",")[0] || "",
        formatted_address: data.display_name || "",
        latitude: Number(lat),
        longitude: Number(lng),
      };
    }
  } catch (err) {
    console.warn("Nominatim reverse geocode error", err);
  }

  return {
    city: "",
    district: "",
    state: "",
    state_code: "",
    pincode: "",
    latitude: Number(lat),
    longitude: Number(lng),
  };
}
