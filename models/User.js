const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    profilePicUrl: {
        type: String,
        default: '/img/default-avatar.png' // Default avatar
    },
    bio: {
        type: String
    }
});

const User = mongoose.model('User', UserSchema);

module.exports = User;
