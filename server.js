const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.send('doXXd Backend API is working!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
