const express = require('express');
const jwt = require('jsonwebtoken');
const Post = require('../models/post');
const router = express.Router();

// Middleware to authenticate JWT token
const auth = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.userId;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

// Create a new post
router.post('/', auth, async (req, res) => {
    try {
        const newPost = new Post({
            user: req.user,
            content: req.body.content
        });
        const post = await newPost.save();
        res.json(post);
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

// Get all posts
router.get('/', auth, async (req, res) => {
    try {
        const posts = await Post.find().populate('user', ['username', 'profilePicture']);
        res.json(posts);
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
