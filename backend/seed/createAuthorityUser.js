/**
 * Safe development/seed mechanism for creating authority accounts.
 *
 * There is intentionally no public API endpoint for this - public
 * registration always creates a plain citizen account (see
 * controllers/authController.js). Run this script directly on the server /
 * dev machine to create a department, monitor, or admin account:
 *
 *   node seed/createAuthorityUser.js <email> <department> [role]
 *   node seed/createAuthorityUser.js <email> - monitor
 *   node seed/createAuthorityUser.js <email> <department> [role] --update-existing
 *
 * The password is never a command-line argument. It is read from a hidden
 * prompt (typed twice), so it does not end up in shell history or in the
 * process list. The prompt needs an interactive terminal; piped or scripted
 * input is refused.
 *
 * [role] defaults to "department" and may otherwise be "admin" or "monitor".
 * <department> must exactly match one of Department Routing's department
 * names (see services/departmentRouter.js), e.g. "Water Department".
 * Monitors belong to no department, so pass "-" in that position.
 *
 * If the email already belongs to an account, the script refuses and changes
 * nothing. Pass --update-existing to replace that account's role, department
 * and password. Those changes take effect immediately, and the old password
 * stops working.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { DEPARTMENT_MAP } = require('../services/departmentRouter');

const VALID_DEPARTMENTS = [...new Set(Object.values(DEPARTMENT_MAP))];
const VALID_ROLES = ['department', 'admin', 'monitor'];
// Matches the minlength on the User schema's password field.
const MIN_PASSWORD_LENGTH = 6;
const UPDATE_FLAG = '--update-existing';

const USAGE = [
  'Usage: node seed/createAuthorityUser.js <email> <department|-> [role=department] [--update-existing]',
  'The password is requested at a hidden prompt, not on the command line.',
  `Valid departments: ${VALID_DEPARTMENTS.join(', ')}`,
  `Valid roles: ${VALID_ROLES.join(', ')}`,
].join('\n');

// Errors raised here carry messages that are safe to print. They never
// include the password or the value the user typed for a field.
class SeedError extends Error {}

const redact = (message, secret) => (secret ? String(message).split(secret).join('[redacted]') : String(message));

// Turns the raw argv list into validated options. Throws SeedError. Values
// are not echoed back, so a mistyped password cannot end up in the output.
const parseArgs = (argv) => {
  const positional = [];
  let updateExisting = false;

  for (const arg of argv) {
    if (arg === UPDATE_FLAG) {
      updateExisting = true;
    } else if (arg.startsWith('--')) {
      throw new SeedError('Unknown option. Passwords are entered at a hidden prompt, not as arguments.');
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 3) {
    throw new SeedError('Too many arguments. Passwords are entered at a hidden prompt, not as arguments.');
  }

  const [email, departmentArg, role = 'department'] = positional;
  const isMonitor = role === 'monitor';

  if (!email || (!isMonitor && !departmentArg)) {
    throw new SeedError('Missing required arguments.');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new SeedError('Invalid role. See the valid roles below.');
  }
  if (isMonitor && departmentArg !== '-') {
    throw new SeedError('Monitor accounts have no department. Pass "-" in the department position.');
  }

  const department = departmentArg === '-' ? undefined : departmentArg;
  if (!isMonitor && !VALID_DEPARTMENTS.includes(department)) {
    throw new SeedError('Invalid department. See the valid departments below.');
  }

  return { email, department, role, updateExisting };
};

// Refuses to read a password unless both streams are real terminals. Without
// this, a piped password would be read from the pipe, which is not a hidden
// prompt. Non-interactive use is therefore not supported.
const assertInteractiveTerminal = (stdin = process.stdin, stdout = process.stdout) => {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new SeedError(
      'A password can only be entered in an interactive terminal. Non-interactive password input is not supported.'
    );
  }
};

// Reads one line with echo turned off. Enter finishes, Backspace edits, and
// Ctrl+C cancels. Requires a TTY; see assertInteractiveTerminal.
const readHiddenLine = (promptText) =>
  new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    const wasRaw = stdin.isRaw;
    let value = '';

    const finish = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\n');
    };

    const onData = (chunk) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          finish();
          reject(new SeedError('Cancelled. No account was changed.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
        } else if (ch >= ' ') {
          value += ch;
        }
      }
    };

    stdout.write(promptText);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.resume();
  });

// Asks for the password twice and checks it. Returns the password without
// printing it.
const promptForPassword = async (readLine = readHiddenLine) => {
  const password = await readLine('Password: ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new SeedError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const confirmation = await readLine('Confirm password: ');
  if (password !== confirmation) {
    throw new SeedError('Passwords do not match. No account was changed.');
  }
  return password;
};

// Creates the account, or updates it when --update-existing was given.
// getPassword is called only after the existence check passes, so a refused
// request never prompts for a password. UserModel is injectable for tests.
const seedAuthorityUser = async ({
  UserModel = User,
  email,
  department,
  role,
  updateExisting,
  getPassword,
  log = console.log,
}) => {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await UserModel.findOne({ email: normalizedEmail });

  if (existing && !updateExisting) {
    throw new SeedError(
      `An account for ${normalizedEmail} already exists. No changes were made. ` +
        `To replace its role, department and password, re-run with ${UPDATE_FLAG}.`
    );
  }

  // Assigning undefined clears the field, so a former department account
  // that is changed to monitor loses its department.
  const isMonitor = role === 'monitor';
  const assignedDepartment = isMonitor ? undefined : department;
  const label = isMonitor ? 'department=none' : `department=${department}`;

  const password = await getPassword();

  try {
    if (existing) {
      const oldDepartment = existing.department || 'none';
      log(
        `${UPDATE_FLAG}: ${normalizedEmail} changes from role=${existing.role}, department=${oldDepartment} ` +
          `to role=${role}, ${label}. Its password is replaced and the old one stops working.`
      );
      existing.role = role;
      existing.department = assignedDepartment;
      existing.password = password;
      await existing.save();
      log(`Updated existing user ${normalizedEmail} -> role=${role}, ${label}`);
      return 'updated';
    }

    await UserModel.create({
      name: isMonitor ? 'ResolveNet Monitor' : `${department} Authority`,
      email: normalizedEmail,
      password,
      role,
      department: assignedDepartment,
    });
    log(`Created account ${normalizedEmail} -> role=${role}, ${label}`);
    return 'created';
  } catch (error) {
    // Validation errors can echo the submitted value, so strip the password.
    throw new SeedError(redact(error.message, password));
  }
};

const main = async (argv = process.argv.slice(2)) => {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    error.message = `${error.message}\n${USAGE}`;
    throw error;
  }
  assertInteractiveTerminal();

  await mongoose.connect(process.env.MONGO_URI);
  try {
    await seedAuthorityUser({
      ...options,
      getPassword: () => promptForPassword(),
    });
  } finally {
    await mongoose.disconnect();
  }
};

module.exports = {
  parseArgs,
  assertInteractiveTerminal,
  promptForPassword,
  seedAuthorityUser,
  SeedError,
  MIN_PASSWORD_LENGTH,
};

if (require.main === module) {
  main().catch((error) => {
    // Only the error type is printed for unexpected errors, since their
    // messages (for example, connection errors) can include config values.
    const detail = error instanceof SeedError ? error.message : `${error.name} (see MONGO_URI in .env)`;
    console.error(`Failed to create authority user: ${detail}`);
    process.exit(1);
  });
}
