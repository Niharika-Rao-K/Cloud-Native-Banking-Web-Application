// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

// node-fetch (ESM safe)
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

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
// TEMPORARY TEST ROUTE (bypass session)
// ---------------------------
app.post('/test', (req, res) => {
  console.log('🚀 /test route hit');
  console.log('Body:', req.body);
  res.send('ok');
});


// ---------------------------
// ROUTES
// ---------------------------
app.get('/', (_, res) =>
  res.sendFile(path.join(__dirname, 'views/login.html'))
);

app.get('/signup', (_, res) =>
  res.sendFile(path.join(__dirname, 'views/signup.html'))
);

// ---------------------------
// AUTH
// ---------------------------
app.post('/signup', async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    await pool.query(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [req.body.email, hash]
    );
    res.redirect('/');
  } catch (err) {
    res.send('Signup error');
  }
});

app.post('/login', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email=?',
      [req.body.email]
    );

    if (!rows[0]) return res.send('Invalid login');

    const ok = await bcrypt.compare(req.body.password, rows[0].password);
    if (!ok) return res.send('Invalid login');

    req.session.userId = rows[0].id;
    req.session.email = rows[0].email;

    res.redirect('/account');
  } catch (err) {
    res.send('Login error');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------------------------
// ACCOUNT
// ---------------------------
app.get('/account', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  try {
    const [rows] = await pool.query(
      'SELECT email, balance FROM users WHERE id=?',
      [req.session.userId]
    );

    res.send(`
      <h2>Welcome ${rows[0].email}</h2>
      <h3>Balance: $${rows[0].balance}</h3>

      <form method="POST" action="/transfer">
        <input name="receiver" placeholder="Receiver Email" required />
        <input name="amount" type="number" step="0.01" required />
        <button>Transfer</button>
      </form>

      <a href="/logout">Logout</a>
    `);
  } catch (err) {
    res.send('Error loading account');
  }
});

// ---------------------------
// ✅ TRANSFER MONEY (ASYNC/AWAIT + LOGS)
// ---------------------------
app.post('/transfer', async (req, res) => {
  console.log('🚀 /transfer route hit');

  if (!req.session.userId) return res.redirect('/');

  try {
    console.log('Request body:', req.body);
    console.log('Session email:', req.session.email);

    const receiver = req.body.receiver;
    const amt = parseFloat(req.body.amount);

    if (!receiver || isNaN(amt) || amt <= 0) {
      return res.send('Invalid transfer data');
    }

    const conn = await pool.getConnection();
    await conn.beginTransaction();

    // Get sender
    const [senderRows] = await conn.query('SELECT * FROM users WHERE id=?', [req.session.userId]);
    if (!senderRows[0] || senderRows[0].balance < amt) {
      await conn.rollback();
      conn.release();
      return res.send('Insufficient balance');
    }

    // Get receiver
    const [recvRows] = await conn.query('SELECT * FROM users WHERE email=?', [receiver]);
    if (!recvRows[0]) {
      await conn.rollback();
      conn.release();
      return res.send('Receiver not found');
    }

    // Update balances
    await conn.query('UPDATE users SET balance = balance - ? WHERE id=?', [amt, senderRows[0].id]);
    await conn.query('UPDATE users SET balance = balance + ? WHERE id=?', [amt, recvRows[0].id]);

    // Log transaction
    await conn.query(
      'INSERT INTO transactions (sender_id, receiver_id, type, amount, date) VALUES (?, ?, "transfer", ?, NOW())',
      [senderRows[0].id, recvRows[0].id, amt]
    );

    await conn.commit();
    conn.release();

    console.log('✅ DB transaction committed');

    // Send audit to Lambda
    console.log('📤 Sending audit to Lambda');
    const response = await fetch('https://ouuoixhdzj.execute-api.us-east-1.amazonaws.com/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: req.session.email,
        amount: amt,
        type: 'transfer',
        timestamp: new Date().toISOString()
      })
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


