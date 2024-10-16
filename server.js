const express = require('express');
const path = require('path'); // To handle file paths
const multer = require('multer'); // For file uploads
const jwt = require('jsonwebtoken'); // For authentication
const bcrypt = require('bcryptjs'); // For password hashing
const mongoose = require('mongoose'); // To connect with MongoDB
const User = require('./models/User'); // Assuming you have a User model
const cors = require('cors'); // To handle CORS errors
const app = express();
const PORT = process.env.PORT || 5000;

require('dotenv').config(); // This loads the .env file

// Middleware for JSON parsing
app.use(express.json());

// Enable CORS
app.use(cors());

// Serve static files (for profile pictures)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error(err));

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

// Set up storage for Multer to handle file uploads (profile pictures)
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, req.user.id + path.extname(file.originalname)); // File name is user ID + file extension
    }
});
const upload = multer({ storage });

// Test route to ensure API is working
app.get('/', (req, res) => {
    res.json({ msg: 'doXXd Backend API is working!' }); // Return response in JSON format
});

// Route: Register a new user
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ msg: 'All fields are required' });
    }

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
        res.status(500).json({ msg: 'Server error' }); // Always return JSON formatted error
    }
});

// Route: Login a user
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ msg: 'All fields are required' });
    }

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
        res.status(500).json({ msg: 'Server error' }); // Return JSON formatted error
    }
});

// Route: Get Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
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

// Route: Update Profile (with optional profile picture upload)
app.post('/api/profile', authenticateToken, upload.single('profilePic'), async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        if (req.body.username) user.username = req.body.username;
        if (req.body.bio) user.bio = req.body.bio;

        if (req.file) {
            user.profilePicUrl = `/uploads/${req.file.filename}`;
        }

        await user.save();

        res.json({ success: true, msg: 'Profile updated successfully!' });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

// Listen on the defined port
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
