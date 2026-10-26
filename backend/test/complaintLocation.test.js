/**
 * Tests for complaint location: validation, saving through createComplaint,
 * what departments can read, and the schema limits.
 *
 * Uses node:test. The database is mocked, so no MongoDB is needed.
 * Run with: npm test (from backend/).
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const { parseComplaintLocation, MAX_ADDRESS_LENGTH } = require('../services/complaintLocation');
const { createComplaint, getDepartmentComplaints } = require('../controllers/complaintController');

const mockRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const citizen = { id: 'citizen-1', role: 'citizen' };

let create;

beforeEach(() => {
  create = mock.method(Complaint, 'create', async (data) => ({ _id: 'c-new', ...data }));
  mock.method(Notification, 'create', async () => ({}));
});

afterEach(() => {
  mock.restoreAll();
});

const submit = async (body) => {
  const res = mockRes();
  await createComplaint({ user: citizen, body }, res);
  return res;
};

const savedData = () => create.mock.calls[0].arguments[0];

describe('parseComplaintLocation: accepted input', () => {
  it('treats a missing or empty location as no location', () => {
    for (const raw of [undefined, null, '', 'null']) {
      assert.deepEqual(parseComplaintLocation(raw), { ok: true, location: undefined }, `input ${String(raw)}`);
    }
  });

  it('accepts coordinates alone', () => {
    assert.deepEqual(parseComplaintLocation({ latitude: 12.9716, longitude: 77.5946 }), {
      ok: true,
      location: { latitude: 12.9716, longitude: 77.5946 },
    });
  });

  it('accepts a typed address alone, trimmed', () => {
    assert.deepEqual(parseComplaintLocation({ address: '  Main Street near the school  ' }), {
      ok: true,
      location: { address: 'Main Street near the school' },
    });
  });

  it('accepts coordinates and an address together', () => {
    assert.deepEqual(parseComplaintLocation({ latitude: 0, longitude: 0, address: 'Equator Road' }), {
      ok: true,
      location: { latitude: 0, longitude: 0, address: 'Equator Road' },
    });
  });

  it('accepts the JSON string that multipart uploads send', () => {
    assert.deepEqual(parseComplaintLocation('{"latitude":-33.86,"longitude":151.2}'), {
      ok: true,
      location: { latitude: -33.86, longitude: 151.2 },
    });
  });

  it('accepts the exact range limits', () => {
    assert.equal(parseComplaintLocation({ latitude: 90, longitude: 180 }).ok, true);
    assert.equal(parseComplaintLocation({ latitude: -90, longitude: -180 }).ok, true);
  });

  it('drops any keys other than latitude, longitude and address', () => {
    const result = parseComplaintLocation({
      latitude: 10,
      longitude: 20,
      user: 'someone-else',
      homeAddress: '1 Private Lane',
    });
    assert.deepEqual(result, { ok: true, location: { latitude: 10, longitude: 20 } });
  });

  it('treats an object with only empty values as no location', () => {
    assert.deepEqual(parseComplaintLocation({ address: '   ' }), { ok: true, location: undefined });
    assert.deepEqual(parseComplaintLocation({}), { ok: true, location: undefined });
  });
});

describe('parseComplaintLocation: rejected input', () => {
  const rejects = (raw, message) => {
    const result = parseComplaintLocation(raw);
    assert.equal(result.ok, false);
    assert.equal(result.message, message);
  };

  it('rejects text that is not valid JSON', () => {
    rejects('{not json', 'Location must be valid JSON');
  });

  it('rejects a non-object such as a number, a string, or an array', () => {
    const message = 'Location must be an object with latitude and longitude, an address, or both';
    rejects(42, message);
    rejects('"just text"', message);
    rejects([1, 2], message);
  });

  it('rejects latitude without longitude, and the reverse', () => {
    const message = 'Latitude and longitude must be provided together';
    rejects({ latitude: 10 }, message);
    rejects({ longitude: 10 }, message);
  });

  it('rejects latitude outside -90 to 90', () => {
    const message = 'Latitude must be a number between -90 and 90';
    rejects({ latitude: 90.0001, longitude: 0 }, message);
    rejects({ latitude: -91, longitude: 0 }, message);
  });

  it('rejects longitude outside -180 to 180', () => {
    const message = 'Longitude must be a number between -180 and 180';
    rejects({ latitude: 0, longitude: 180.5 }, message);
    rejects({ latitude: 0, longitude: -181 }, message);
  });

  it('rejects coordinates that are not finite numbers', () => {
    rejects({ latitude: '12.5', longitude: 10 }, 'Latitude must be a number between -90 and 90');
    rejects({ latitude: 10, longitude: Infinity }, 'Longitude must be a number between -180 and 180');
    rejects({ latitude: NaN, longitude: 10 }, 'Latitude must be a number between -90 and 90');
  });

  it('rejects an address that is not text', () => {
    rejects({ address: 42 }, 'Address must be text');
  });

  it('rejects an address longer than the limit', () => {
    rejects(
      { address: 'a'.repeat(MAX_ADDRESS_LENGTH + 1) },
      `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer`
    );
  });

  it('accepts an address at exactly the limit', () => {
    assert.equal(parseComplaintLocation({ address: 'a'.repeat(MAX_ADDRESS_LENGTH) }).ok, true);
  });
});

describe('createComplaint saves the location', () => {
  it('saves coordinates and address sent as a multipart JSON string', async () => {
    const res = await submit({
      description: 'Pothole on Main Street',
      location: JSON.stringify({ latitude: 12.97, longitude: 77.59, address: 'Main Street' }),
    });

    assert.equal(res.statusCode, 201);
    assert.deepEqual(savedData().location, { latitude: 12.97, longitude: 77.59, address: 'Main Street' });
  });

  it('saves a location sent as a plain object (JSON request)', async () => {
    const res = await submit({
      description: 'Garbage overflowing near the park',
      location: { address: 'Near the park gate' },
    });

    assert.equal(res.statusCode, 201);
    assert.deepEqual(savedData().location, { address: 'Near the park gate' });
  });

  it('saves no location when the citizen gives none, so the complaint still submits', async () => {
    const res = await submit({ description: 'Streetlight is out' });

    assert.equal(res.statusCode, 201);
    assert.equal(savedData().location, undefined);
  });

  it('refuses an invalid location with 400 and writes nothing', async () => {
    const res = await submit({
      description: 'Pothole on Main Street',
      location: JSON.stringify({ latitude: 200, longitude: 10 }),
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Latitude must be a number between -90 and 90');
    assert.equal(create.mock.callCount(), 0);
  });

  it('refuses a location string that is not JSON with 400 and writes nothing', async () => {
    const res = await submit({ description: 'Pothole', location: '{oops' });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Location must be valid JSON');
    assert.equal(create.mock.callCount(), 0);
  });
});

describe('department can read the location, citizen identity stays hidden', () => {
  // Captures the field list the department query asks for.
  const departmentSelection = async () => {
    let selected;
    mock.method(Complaint, 'find', () => ({
      select: (fields) => {
        selected = fields;
        return { sort: async () => [] };
      },
    }));

    const res = mockRes();
    await getDepartmentComplaints({ user: { id: 'auth-1', role: 'department', department: 'Road Department' } }, res);
    assert.equal(res.statusCode, 200);
    return selected.split(' ');
  };

  it('includes location in the department field list', async () => {
    assert.ok((await departmentSelection()).includes('location'));
  });

  it('still excludes the citizen user reference', async () => {
    const fields = await departmentSelection();
    assert.equal(fields.includes('user'), false);
  });
});

describe('Complaint schema location limits', () => {
  const base = { user: '64b000000000000000000001', description: 'x' };

  it('accepts a valid location', async () => {
    const complaint = new Complaint({ ...base, location: { latitude: 45, longitude: -120, address: 'Ok' } });
    await complaint.validate();
  });

  it('rejects an out-of-range latitude', async () => {
    const complaint = new Complaint({ ...base, location: { latitude: 120, longitude: 0 } });
    await assert.rejects(complaint.validate(), (error) => error.errors['location.latitude'] !== undefined);
  });

  it('rejects an out-of-range longitude', async () => {
    const complaint = new Complaint({ ...base, location: { latitude: 0, longitude: 250 } });
    await assert.rejects(complaint.validate(), (error) => error.errors['location.longitude'] !== undefined);
  });

  it('rejects an address longer than the limit', async () => {
    const complaint = new Complaint({ ...base, location: { address: 'a'.repeat(MAX_ADDRESS_LENGTH + 1) } });
    await assert.rejects(complaint.validate(), (error) => error.errors['location.address'] !== undefined);
  });
});
