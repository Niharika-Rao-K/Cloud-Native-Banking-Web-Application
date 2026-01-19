// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();
const fetch = require('node-fetch'); // for Node <18

const app = express();
const PORT = 3000;

// ---------------------------
// MIDDLEWARE
// ---------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true,
  })
);

// ---------------------------
// DATABASE
// ---------------------------
if (!process.env.DB_HOST) {
  console.error('❌ DB_HOST missing in .env');
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Connected to MySQL RDS');
    conn.release();
  } catch (err) {
    console.error('❌ DB connection failed:', err.message);
    process.exit(1);
  }
})();

// ---------------------------
// TEMP TEST ROUTE
// ---------------------------
app.post('/test', (req, res) => {
  console.log('🚀 /test route hit');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  res.json({ received: req.body });
});

// ---------------------------
// ROUTES - HTML VIEWS
// ---------------------------
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/signup', (_, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/account', (_, res) => res.sendFile(path.join(__dirname, 'views', 'account.html')));
app.get('/transactions', (_, res) => res.sendFile(path.join(__dirname, 'views', 'transactions.html')));
app.get('/profile', (_, res) => res.sendFile(path.join(__dirname, 'views', 'profile.html')));

// ---------------------------
// AUTH
// ---------------------------
app.post('/signup', async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    await pool.query('INSERT INTO users (email, password) VALUES (?, ?)', [
      req.body.email,
      hash,
    ]);
    console.log(`✅ New user registered: ${req.body.email}`);
    res.redirect('/');
  } catch (err) {
    console.error('❌ Signup error:', err);
    res.send('Signup error');
  }
});

app.post('/login', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email=?', [req.body.email]);
    if (!rows[0]) {
      console.log(`⚠️ Invalid login attempt for ${req.body.email}`);
      return res.send('Invalid login');
    }

    const ok = await bcrypt.compare(req.body.password, rows[0].password);
    if (!ok) {
      console.log(`⚠️ Invalid password for ${req.body.email}`);
      return res.send('Invalid login');
    }

    req.session.userId = rows[0].id;
    req.session.email = rows[0].email;
    console.log(`✅ User logged in: ${req.session.email}`);

    res.redirect('/account');
  } catch (err) {
    console.error('❌ Login error:', err);
    res.send('Login error');
  }
});

app.get('/logout', (req, res) => {
  console.log(`ℹ️ User logged out: ${req.session.email}`);
  req.session.destroy(() => res.redirect('/'));
});

// ---------------------------
// API ROUTES FOR DYNAMIC DATA
// ---------------------------
app.get('/api/account', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const [rows] = await pool.query('SELECT email, balance FROM users WHERE id=?', [req.session.userId]);
    res.json({ email: rows[0].email, balance: rows[0].balance });
  } catch (err) {
    console.error('❌ /api/account error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/transactions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const [rows] = await pool.query(
      `SELECT t.id, u1.email AS sender, u2.email AS receiver, t.type, t.amount, t.date
       FROM transactions t
       LEFT JOIN users u1 ON t.sender_id = u1.id
       LEFT JOIN users u2 ON t.receiver_id = u2.id
       WHERE t.sender_id=? OR t.receiver_id=?
       ORDER BY t.date DESC`,
      [req.session.userId, req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ /api/transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------
// TRANSFER + LAMBDA AUDIT
// ---------------------------
app.post('/transfer', async (req, res) => {
  console.log('🚀 /transfer route hit');
  if (!req.session.userId) return res.redirect('/');

  try {
    const receiver = req.body.receiver;
    const amt = parseFloat(req.body.amount);

    if (!receiver || isNaN(amt) || amt <= 0) return res.send('Invalid transfer data');

    const conn = await pool.getConnection();
    await conn.beginTransaction();

    const [senderRows] = await conn.query('SELECT * FROM users WHERE id=?', [req.session.userId]);
    if (!senderRows[0] || senderRows[0].balance < amt) {
      await conn.rollback();
      conn.release();
      return res.send('Insufficient balance');
    }

    const [recvRows] = await conn.query('SELECT * FROM users WHERE email=?', [receiver]);
    if (!recvRows[0]) {
      await conn.rollback();
      conn.release();
      return res.send('Receiver not found');
    }

    await conn.query('UPDATE users SET balance = balance - ? WHERE id=?', [amt, senderRows[0].id]);
    await conn.query('UPDATE users SET balance = balance + ? WHERE id=?', [amt, recvRows[0].id]);

    await conn.query(
      'INSERT INTO transactions (sender_id, receiver_id, type, amount, date) VALUES (?, ?, "transfer", ?, NOW())',
      [senderRows[0].id, recvRows[0].id, amt]
    );

    await conn.commit();
    conn.release();
    console.log(`✅ Transfer completed: ${senderRows[0].email} -> ${receiver} : $${amt}`);

    // 🔥 Send audit to Lambda
    console.log('📤 Sending audit to Lambda');
    const response = await fetch('https://ouuoixhdzj.execute-api.us-east-1.amazonaws.com/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: req.session.email,
        amount: amt,
        type: 'transfer',
        timestamp: new Date().toISOString(),
      }),
    });

    const data = await response.json();
    console.log('✅ Lambda response:', data);

    res.redirect('/account');
  } catch (err) {
    console.error('❌ Transfer failed:', err);
    res.status(500).send('Transfer failed');
  }
});

// ---------------------------
app.listen(PORT, () =>
  console.log(`✅ Server running on http://<elastic_ip>:${PORT}`)
);
