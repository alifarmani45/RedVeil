require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const apiRoutes = require('./src/routes/api');
const subRoutes = require('./src/routes/sub');
const { requireAuth } = require('./src/auth');
const xray = require('./src/xray');

const app = express();
const PORT = process.env.PANEL_PORT || 3000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'redveil-change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 },
  })
);

// subscription pages are public (no auth) — identified by unguessable subId
app.use('/', subRoutes);

// API
app.use('/api', apiRoutes);

// static assets (css/js) always public
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));

// protected dashboard
app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/dashboard.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));

app.listen(PORT, () => {
  console.log(`RedVeil panel listening on :${PORT}`);
  xray.start();
});
