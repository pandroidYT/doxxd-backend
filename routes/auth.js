const express = require('express');
const bcrypt = require('bcryptjs'); // For password hashing
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Assuming you have a User model for MongoDB
const router = express.Router();

// Route: Register a new user
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    try {
        // Check if the user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        // Create a new user instance
        user = new User({
            username,
            email,
            password
        });

        // Hash the password before saving
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save(); // Save the user to the database

        // Generate a JWT token for the user
        const payload = {
            user: {
                id: user.id
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET, // Your JWT secret key
            { expiresIn: '1h' },
            (err, token) => {
                if (err) throw err;
                res.json({ token }); // Return the token to the frontend
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Route: Login a user
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check if the user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // Compare password with the hashed one
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // Generate a JWT token for the user
        const payload = {
            user: {
                id: user.id
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) throw err;
                res.json({ token }); // Return the token to the frontend
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;
