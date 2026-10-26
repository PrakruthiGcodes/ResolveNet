/**
 * Focused tests for the authority-user seed script (seed/createAuthorityUser.js).
 *
 * Uses Node's built-in test runner (node:test). The User model is replaced
 * with a fake, so these tests never connect to MongoDB. Run with: npm test
 * (from backend/).
 */

const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  assertInteractiveTerminal,
  promptForPassword,
  seedAuthorityUser,
  SeedError,
} = require('../seed/createAuthorityUser');

const PASSWORD = 'Correct-Horse-9';

const fakeExistingUser = (overrides = {}) => ({
  role: 'citizen',
  department: undefined,
  password: 'old-hash',
  save: mock.fn(async () => {}),
  ...overrides,
});

const fakeUserModel = ({ existing = null, createError } = {}) => ({
  findOne: mock.fn(async () => existing),
  create: mock.fn(async (doc) => {
    if (createError) throw createError;
    return doc;
  }),
});

const logSink = () => {
  const log = mock.fn();
  const lines = () => log.mock.calls.map((call) => call.arguments.join(' '));
  return { log, lines };
};

afterEach(() => {
  mock.restoreAll();
});

describe('parseArgs', () => {
  it('reads email, department and role, with no password argument', () => {
    assert.deepEqual(parseArgs(['Water.Ops@example.com', 'Water Department', 'department']), {
      email: 'Water.Ops@example.com',
      department: 'Water Department',
      role: 'department',
      updateExisting: false,
    });
  });

  it('accepts a monitor with "-" in the department position', () => {
    const options = parseArgs(['mon@example.com', '-', 'monitor']);
    assert.equal(options.role, 'monitor');
    assert.equal(options.department, undefined);
  });

  it('turns on updateExisting only with the explicit flag', () => {
    assert.equal(parseArgs(['a@example.com', 'Road Department']).updateExisting, false);
    assert.equal(parseArgs(['a@example.com', 'Road Department', '--update-existing']).updateExisting, true);
  });

  it('rejects unknown flags without echoing the value', () => {
    assert.throws(
      () => parseArgs(['a@example.com', 'Road Department', '--password=Secret123']),
      (error) => error instanceof SeedError && !error.message.includes('Secret123')
    );
  });

  it('rejects a leftover positional argument, which is how an old password would arrive', () => {
    assert.throws(
      () => parseArgs(['a@example.com', PASSWORD, 'Road Department', 'department']),
      (error) => error instanceof SeedError && !error.message.includes(PASSWORD)
    );
  });

  it('rejects an invalid department without echoing it', () => {
    assert.throws(
      () => parseArgs(['a@example.com', 'Not A Real Department']),
      (error) => error instanceof SeedError && !error.message.includes('Not A Real Department')
    );
  });

  it('rejects an invalid role and a monitor given a department', () => {
    assert.throws(() => parseArgs(['a@example.com', 'Road Department', 'superuser']), SeedError);
    assert.throws(() => parseArgs(['a@example.com', 'Road Department', 'monitor']), SeedError);
  });
});

describe('creating a new account', () => {
  it('creates the account with the password handed to the model, and logs no password', async () => {
    const UserModel = fakeUserModel();
    const { log, lines } = logSink();

    const result = await seedAuthorityUser({
      UserModel,
      email: '  Water.Ops@Example.com ',
      department: 'Water Department',
      role: 'department',
      updateExisting: false,
      getPassword: async () => PASSWORD,
      log,
    });

    assert.equal(result, 'created');
    assert.equal(UserModel.create.mock.callCount(), 1);
    assert.deepEqual(UserModel.create.mock.calls[0].arguments[0], {
      name: 'Water Department Authority',
      email: 'water.ops@example.com',
      password: PASSWORD,
      role: 'department',
      department: 'Water Department',
    });
    assert.match(lines().join('\n'), /Created account water\.ops@example\.com/);
    assert.ok(!lines().join('\n').includes(PASSWORD));
  });

  it('creates a monitor with no department', async () => {
    const UserModel = fakeUserModel();
    await seedAuthorityUser({
      UserModel,
      email: 'mon@example.com',
      department: undefined,
      role: 'monitor',
      updateExisting: false,
      getPassword: async () => PASSWORD,
      log: () => {},
    });
    const doc = UserModel.create.mock.calls[0].arguments[0];
    assert.equal(doc.role, 'monitor');
    assert.equal(doc.department, undefined);
    assert.equal(doc.name, 'ResolveNet Monitor');
  });
});

describe('existing accounts', () => {
  it('refuses to overwrite by default, without asking for a password or saving', async () => {
    const existing = fakeExistingUser({ role: 'citizen' });
    const UserModel = fakeUserModel({ existing });
    const getPassword = mock.fn(async () => PASSWORD);

    await assert.rejects(
      seedAuthorityUser({
        UserModel,
        email: 'citizen@example.com',
        department: 'Road Department',
        role: 'department',
        updateExisting: false,
        getPassword,
        log: () => {},
      }),
      (error) => error instanceof SeedError && /No changes were made/.test(error.message)
    );

    assert.equal(getPassword.mock.callCount(), 0);
    assert.equal(existing.save.mock.callCount(), 0);
    assert.equal(UserModel.create.mock.callCount(), 0);
    assert.equal(existing.role, 'citizen');
    assert.equal(existing.password, 'old-hash');
  });

  it('requires the explicit --update-existing flag to change the account', async () => {
    const existing = fakeExistingUser();
    const UserModel = fakeUserModel({ existing });

    await assert.rejects(
      seedAuthorityUser({
        UserModel,
        email: 'a@example.com',
        department: 'Road Department',
        role: 'department',
        getPassword: async () => PASSWORD,
        log: () => {},
      }),
      SeedError
    );
    assert.equal(existing.save.mock.callCount(), 0);
  });

  it('updates the account when the flag is given, and says what will change first', async () => {
    const existing = fakeExistingUser({ role: 'citizen', department: undefined });
    const UserModel = fakeUserModel({ existing });
    const { log, lines } = logSink();

    const result = await seedAuthorityUser({
      UserModel,
      email: 'a@example.com',
      department: 'Road Department',
      role: 'department',
      updateExisting: true,
      getPassword: async () => PASSWORD,
      log,
    });

    assert.equal(result, 'updated');
    assert.equal(existing.role, 'department');
    assert.equal(existing.department, 'Road Department');
    assert.equal(existing.password, PASSWORD);
    assert.equal(existing.save.mock.callCount(), 1);
    assert.equal(UserModel.create.mock.callCount(), 0);

    const output = lines();
    assert.match(output[0], /changes from role=citizen, department=none to role=department/);
    assert.ok(!output.join('\n').includes(PASSWORD));
  });
});

describe('password handling', () => {
  it('never prints the password, even when the model error contains it', async () => {
    const UserModel = fakeUserModel({ createError: new Error(`bad value ${PASSWORD} for password`) });
    const { log, lines } = logSink();

    await assert.rejects(
      seedAuthorityUser({
        UserModel,
        email: 'a@example.com',
        department: 'Road Department',
        role: 'department',
        updateExisting: false,
        getPassword: async () => PASSWORD,
        log,
      }),
      (error) => error instanceof SeedError && !error.message.includes(PASSWORD)
    );
    assert.ok(!lines().join('\n').includes(PASSWORD));
  });

  it('rejects a password shorter than the schema minimum', async () => {
    await assert.rejects(
      promptForPassword(async () => 'short'),
      (error) => error instanceof SeedError && !error.message.includes('short')
    );
  });

  it('rejects mismatched confirmation', async () => {
    const answers = [PASSWORD, 'Different-Pass-1'];
    await assert.rejects(
      promptForPassword(async () => answers.shift()),
      (error) => error instanceof SeedError && /do not match/.test(error.message)
    );
  });

  it('returns the password once both entries match', async () => {
    const answers = [PASSWORD, PASSWORD];
    const password = await promptForPassword(async () => answers.shift());
    assert.equal(password, PASSWORD);
  });

  it('refuses non-interactive input', () => {
    assert.throws(
      () => assertInteractiveTerminal({ isTTY: false }, { isTTY: true }),
      (error) => error instanceof SeedError && /interactive terminal/.test(error.message)
    );
    assert.throws(() => assertInteractiveTerminal({ isTTY: true }, { isTTY: false }), SeedError);
    assert.doesNotThrow(() => assertInteractiveTerminal({ isTTY: true }, { isTTY: true }));
  });
});
