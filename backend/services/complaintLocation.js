/**
 * Validation for the location a citizen attaches to a complaint.
 *
 * The location is where the civic issue is, not the citizen's own address.
 * It is optional. When given, it holds GPS coordinates, a typed address, or
 * both. Any other key in the submitted object is dropped, so nothing beyond
 * these fields can be saved.
 *
 * Returns { ok: true, location } (location is undefined when nothing usable
 * was given) or { ok: false, message }.
 */

const MAX_ADDRESS_LENGTH = 300;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const isAbsent = (value) => value === undefined || value === null;

const fail = (message) => ({ ok: false, message });

const parseComplaintLocation = (raw) => {
  if (isAbsent(raw) || raw === '') {
    return { ok: true, location: undefined };
  }

  // multipart/form-data (used when an image is attached) sends `location` as
  // a JSON string rather than a nested object.
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch (parseError) {
      return fail('Location must be valid JSON');
    }
  }

  if (isAbsent(value)) {
    return { ok: true, location: undefined };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return fail('Location must be an object with latitude and longitude, an address, or both');
  }

  const { latitude, longitude } = value;
  const hasLatitude = !isAbsent(latitude);
  const hasLongitude = !isAbsent(longitude);

  if (hasLatitude !== hasLongitude) {
    return fail('Latitude and longitude must be provided together');
  }

  if (hasLatitude && (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90)) {
    return fail('Latitude must be a number between -90 and 90');
  }

  if (hasLongitude && (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180)) {
    return fail('Longitude must be a number between -180 and 180');
  }

  let address;
  if (!isAbsent(value.address)) {
    if (typeof value.address !== 'string') {
      return fail('Address must be text');
    }
    address = value.address.trim();
    if (address.length > MAX_ADDRESS_LENGTH) {
      return fail(`Address must be ${MAX_ADDRESS_LENGTH} characters or fewer`);
    }
  }

  const location = {};
  if (hasLatitude) {
    location.latitude = latitude;
    location.longitude = longitude;
  }
  if (address) {
    location.address = address;
  }

  if (Object.keys(location).length === 0) {
    return { ok: true, location: undefined };
  }

  return { ok: true, location };
};

module.exports = { parseComplaintLocation, MAX_ADDRESS_LENGTH };
