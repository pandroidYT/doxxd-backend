const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static('uploads'));

// MongoDB connection
const mongoURI = process.env.MONGODB_URI; // Updated to match your environment variable
if (!mongoURI) {
    console.error('MongoDB URI not found in environment variables!');
    process.exit(1); // Exit the application if no URI is provided
}

// Added connection options to prevent deprecation warnings
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit the application if there’s a MongoDB connection error
    });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Removed logging of environment variables for security in production
