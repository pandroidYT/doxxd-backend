const express = require('express');
const path = require('path'); // To handle file paths
const multer = require('multer'); // For file uploads
const jwt = require('jsonwebtoken'); // For authentication
const app = express();
const PORT = process.env.PORT || 5000;

require('dotenv').config(); // This loads the .env file

// Middleware for JSON parsing
app.use(express.json());

// Serve static files (for profile pictures)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Simple test route to ensure API is working
app.get('/', (req, res) => {
    res.send('doXXd Backend API is working!');
});

// Set up storage for Multer to handle file uploads (profile pictures)
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, req.user.id + path.extname(file.originalname)); // File name is user ID + file extension
    }
});
const upload = multer({ storage });

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Ensure to replace with your JWT secret
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

// Route: Get Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        // Assuming you have a User model to fetch user info from the database
        const user = await User.findById(req.user.id); 
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Send back user data (excluding sensitive info)
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

// Route: Update Profile (with optional profile picture upload)
app.post('/api/profile', authenticateToken, upload.single('profilePic'), async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Update the username and bio if provided
        if (req.body.username) user.username = req.body.username;
        if (req.body.bio) user.bio = req.body.bio;

        // If a new profile picture is uploaded, update the profilePicUrl
        if (req.file) {
            user.profilePicUrl = `/uploads/${req.file.filename}`;
        }

        await user.save(); // Save updated user info

        res.json({ success: true, msg: 'Profile updated successfully!' });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

// Listen on the defined port
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const profileRoutes = require('./routes/profile');
app.use('/api/profile', authenticateToken, profileRoutes); // Profile routes need authentication
