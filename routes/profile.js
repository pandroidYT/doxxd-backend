// Import necessary libraries
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const User = require('../models/User'); // Make sure you have a User model

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Extract token from Authorization header
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Replace with your secret
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

// Configure Multer for profile picture uploads
const storage = multer.diskStorage({
    destination: './uploads/', // Save profile pictures in the 'uploads' directory
    filename: (req, file, cb) => {
        cb(null, req.user.id + path.extname(file.originalname)); // Use user ID as filename
    }
});

const upload = multer({ storage });

// GET: Fetch user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id); // Find user by ID from JWT
        if (!user) return res.status(404).json({ msg: 'User not found' });

        res.json({
            success: true,
            user: {
                username: user.username,
                bio: user.bio || '',
                profilePicUrl: user.profilePicUrl || '/img/default-avatar.png' // Default avatar if none exists
            }
        });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST: Update user profile
router.post('/profile', authenticateToken, upload.single('profilePic'), async (req, res) => {
    try {
        const user = await User.findById(req.user.id); // Find the user

        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Update username and bio if provided
        if (req.body.username) user.username = req.body.username;
        if (req.body.bio) user.bio = req.body.bio;

        // Update profile picture if uploaded
        if (req.file) {
            user.profilePicUrl = `/uploads/${req.file.filename}`;
        }

        await user.save(); // Save the updated user profile

        res.json({ success: true, msg: 'Profile updated successfully!' });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
