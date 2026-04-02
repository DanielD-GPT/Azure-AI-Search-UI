const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const searchRoutes = require('./routes/search');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public', {
    maxAge: '1h',
    etag: true,
}));

// Routes
app.use('/api/search', searchRoutes);

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});