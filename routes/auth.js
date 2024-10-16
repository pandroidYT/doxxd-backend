const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Register a new user
router.post('/register', async (req, res) => {
 try {
     const { username, email, password } = req.body;

     // Check if user already exists
     let user = await User.findOne({ email });
     if (user) {
         return res.status(400).json({ msg: 'User already exists' });
     }

     // Hash password and create new user
     const salt = await bcrypt.genSalt(10);
     const hashedPassword = await bcrypt.hash(password, salt);

     user = new User({ username, email, password: hashedPassword });
     await user.save();

     // Generate JWT token
     const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
     res.json({ token });
 } catch (error) {
     res.status(500).json({ msg: 'Server error' });
 }
});

// Login a user
router.post('/login', async (req, res) => {
 try {
     const { email, password } = req.body;

     // Find user by email
     const user = await User.findOne({ email });
     if (!user) {
         return res.status(400).json({ msg: 'Invalid credentials' });
     }

     // Check password
     const isMatch = await bcrypt.compare(password, user.password);
     if (!isMatch) {
         return res.status(400).json({ msg: 'Invalid credentials' });
     }

     // Generate JWT token
     const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
     res.json({ token });
 } catch (error) {
     res.status(500).json({ msg: 'Server error' });
 }
});

module.exports = router;
