const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// Mongoose validation messages include the rejected value, which for a
// password is the password itself. Describe the failure without the value
// so it is safe to log and to return to the client.
const describeRegistrationError = (error) => {
  if (error.name === 'ValidationError') {
    return `validation failed for: ${Object.keys(error.errors).join(', ')}`;
  }
  if (error.code === 11000) {
    return 'duplicate email';
  }
  return error.message;
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    // SECURITY: public registration always creates a plain citizen account.
    // role/department are never taken from the request body here - a client
    // sending { "role": "department" } (or "admin") must not be able to
    // self-assign a privileged role. Authority accounts are created through
    // a separate trusted mechanism (see backend/seed/createAuthorityUser.js).
    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: 'citizen',
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (error) {
    const reason = describeRegistrationError(error);
    console.error(`[auth] Registration failed: ${reason}`);
    return res.status(500).json({ message: 'Registration failed', error: reason });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (error) {
    console.error(`[auth] Login failed: ${error.message}`);
    return res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

const getMe = async (req, res) => {
  return res.status(200).json({ user: req.user });
};

module.exports = { registerUser, loginUser, getMe };
