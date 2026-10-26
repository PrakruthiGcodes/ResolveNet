const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { DEPARTMENT_MAP } = require('../services/departmentRouter');

// Same fixed department names Department Routing already assigns to
// complaints, so an authority's `department` always matches something a
// complaint can actually have.
const VALID_DEPARTMENTS = [...new Set(Object.values(DEPARTMENT_MAP))];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['citizen', 'admin', 'department', 'monitor'],
      default: 'citizen',
    },
    // Only meaningful for role: 'department' (a department authority
    // account). Monitors have no department. Never settable through public
    // registration - see the security note in authController.js.registerUser.
    department: {
      type: String,
      trim: true,
      enum: VALID_DEPARTMENTS,
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
