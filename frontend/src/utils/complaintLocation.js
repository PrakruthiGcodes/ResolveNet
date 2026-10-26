// Helpers for the location a citizen attaches to a complaint. The address limit
// mirrors backend/services/complaintLocation.js. The backend validates every
// value again, so the checks here only give immediate feedback.
// This file has no imports, so its tests can run directly under node.

export const MAX_ADDRESS_LENGTH = 300;

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Builds the object sent as `location`, or null when there is nothing to send.
// Coordinates are included only as a pair.
export const buildLocationPayload = ({ latitude, longitude, address } = {}) => {
  const payload = {};
  if (isNumber(latitude) && isNumber(longitude)) {
    payload.latitude = latitude;
    payload.longitude = longitude;
  }
  const trimmedAddress = (address || '').trim();
  if (trimmedAddress) {
    payload.address = trimmedAddress;
  }
  return Object.keys(payload).length > 0 ? payload : null;
};

// Returns a message for the address field, or an empty string when it is valid.
export const validateAddress = (address) => {
  if ((address || '').trim().length > MAX_ADDRESS_LENGTH) {
    return `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`;
  }
  return '';
};

export const hasCoordinates = (location) =>
  Boolean(location) && isNumber(location.latitude) && isNumber(location.longitude);

export const formatCoordinates = (latitude, longitude) => `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

// The address the citizen typed, otherwise the coordinates, otherwise null.
export const formatComplaintLocation = (location) => {
  if (!location) return null;
  if (location.address) return location.address;
  if (hasCoordinates(location)) return formatCoordinates(location.latitude, location.longitude);
  return null;
};

// A map link for the coordinates, or null when there are none.
export const getMapUrl = (location) => {
  if (!hasCoordinates(location)) return null;
  const { latitude, longitude } = location;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
};

// Converts a Leaflet LatLng ({ lat, lng }) into the { latitude, longitude }
// shape used everywhere else. The order is fixed here so no caller can swap it.
export const coordinatesFromLatLng = ({ lat, lng }) => ({ latitude: lat, longitude: lng });
