/**
 * Tests for the complaint location helpers. Run with: node --test src/utils/complaintLocation.test.js
 * (from frontend/). Uses node:test, so no extra dependency is needed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ADDRESS_LENGTH,
  buildLocationPayload,
  validateAddress,
  hasCoordinates,
  formatComplaintLocation,
  getMapUrl,
  coordinatesFromLatLng,
} from './complaintLocation.js';

describe('buildLocationPayload', () => {
  it('returns null when there is no coordinate pair and no address', () => {
    assert.equal(buildLocationPayload({}), null);
    assert.equal(buildLocationPayload({ address: '   ' }), null);
    assert.equal(buildLocationPayload({ latitude: 10 }), null, 'a lone latitude is not sent');
  });

  it('sends a coordinate pair', () => {
    assert.deepEqual(buildLocationPayload({ latitude: 12.5, longitude: 77.1 }), {
      latitude: 12.5,
      longitude: 77.1,
    });
  });

  it('sends a trimmed address on its own', () => {
    assert.deepEqual(buildLocationPayload({ address: '  Near the bus stop  ' }), {
      address: 'Near the bus stop',
    });
  });

  it('sends coordinates and address together', () => {
    assert.deepEqual(buildLocationPayload({ latitude: 1, longitude: 2, address: 'Ward 5' }), {
      latitude: 1,
      longitude: 2,
      address: 'Ward 5',
    });
  });
});

describe('validateAddress', () => {
  it('accepts an empty address and one at the limit', () => {
    assert.equal(validateAddress(''), '');
    assert.equal(validateAddress('a'.repeat(MAX_ADDRESS_LENGTH)), '');
  });

  it('returns a message for an address over the limit', () => {
    assert.equal(
      validateAddress('a'.repeat(MAX_ADDRESS_LENGTH + 1)),
      `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`
    );
  });
});

describe('hasCoordinates and formatComplaintLocation', () => {
  it('reports no location as null', () => {
    assert.equal(formatComplaintLocation(undefined), null);
    assert.equal(formatComplaintLocation({}), null);
    assert.equal(hasCoordinates({ latitude: 1 }), false);
  });

  it('prefers the typed address for display', () => {
    assert.equal(formatComplaintLocation({ latitude: 1, longitude: 2, address: 'Ward 5' }), 'Ward 5');
  });

  it('shows coordinates to five decimal places when there is no address', () => {
    assert.equal(formatComplaintLocation({ latitude: 12.3, longitude: 77 }), '12.30000, 77.00000');
  });
});

describe('getMapUrl', () => {
  it('is null without coordinates', () => {
    assert.equal(getMapUrl({ address: 'Ward 5' }), null);
  });

  it('builds a map link from the coordinates', () => {
    assert.equal(
      getMapUrl({ latitude: 12.5, longitude: 77.25 }),
      'https://www.openstreetmap.org/?mlat=12.5&mlon=77.25#map=17/12.5/77.25'
    );
  });
});

describe('coordinatesFromLatLng', () => {
  it('maps Leaflet lat and lng to latitude and longitude in the right order', () => {
    assert.deepEqual(coordinatesFromLatLng({ lat: 12.97, lng: 77.59 }), {
      latitude: 12.97,
      longitude: 77.59,
    });
  });

  it('produces a pair that hasCoordinates treats as a valid location', () => {
    const { latitude, longitude } = coordinatesFromLatLng({ lat: 12.97, lng: 77.59 });
    assert.equal(latitude, 12.97);
    assert.equal(longitude, 77.59);
    assert.ok(hasCoordinates({ latitude, longitude }));
  });
});
