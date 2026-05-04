const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

/**
 * User Schema for Authentication with RBAC Support and Bcrypt Hashing
 */
const UserSchema = new mongoose.Schema({
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    profilePic: {
      type: String,
      default: "" 
    },
    role: {
      type: String,
      enum: ['MASTER', 'REPORT TEAM', 'DESIGN TEAM', 'USER'],
      default: 'USER'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
});

// Pre-save hook to hash password
UserSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// Method to compare passwords for login
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);