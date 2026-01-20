// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();
const fetch = require('node-fetch'); // For Node <18

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
    saveUninitialized: false, // important for session persistence
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

// Verify DB connection
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
// AUTH GUARD
// ---------------------------
const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};

// ---------------------------
// HTML ROUTES
// ---------------------------
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/signup', (_, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/account', requireAuth, (_, res) => res.sendFile(path.join(__dirname, 'views', 'account.html')));
app.get('/transactions', requireAuth, (_, res) => res.sendFile(path.join(__dirname, 'views', 'transactions.html')));
app.get('/profile', requireAuth, (_, res) => res.sendFile(path.join(__dirname, 'views', 'profile.html')));

// ---------------------------
// AUTH
// ---------------------------
app.post('/signup', async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    await pool.query('INSERT INTO users (email, password) VALUES (?, ?)', [req.body.email, hash]);
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
// API ROUTES
// ---------------------------
app.get('/api/account', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT email, balance FROM users WHERE id=?', [req.session.userId]);
    res.json({ email: rows[0].email, balance: rows[0].balance });
  } catch (err) {
    console.error('❌ /api/account error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT email FROM users WHERE id=?', [req.session.userId]);
    res.json({ email: rows[0].email });
  } catch (err) {
    console.error('❌ /api/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/transactions', requireAuth, async (req, res) => {
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
// PROFILE DATA API
// ---------------------------
app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT email, full_name, phone, address FROM users WHERE id=?',
      [req.session.userId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    // generate a random account number for display
    const user = rows[0];
    user.account_no = `ACCT${Math.floor(100000 + Math.random() * 900000)}`;

    res.json(user);
  } catch (err) {
    console.error('❌ /api/profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------
// PROFILE UPDATE
// ---------------------------
app.post('/profile/update', requireAuth, async (req, res) => {
  try {
    const { email, password, full_name, phone, address } = req.body;

    let query = 'UPDATE users SET email=?';
    const params = [email];

    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 10);
      query += ', password=?';
      params.push(hash);
    }
    if (full_name !== undefined) { query += ', full_name=?'; params.push(full_name); }
    if (phone !== undefined) { query += ', phone=?'; params.push(phone); }
    if (address !== undefined) { query += ', address=?'; params.push(address); }

    query += ' WHERE id=?';
    params.push(req.session.userId);

    try {
      await pool.query(query, params);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.send('Email already in use');
      throw err;
    }

    req.session.email = email;

    console.log(`✅ Profile updated: ${email}`);

    // CloudWatch audit log
    await fetch('https://ouuoixhdzj.execute-api.us-east-1.amazonaws.com/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: email,
        type: 'profile_update',
        timestamp: new Date().toISOString(),
      }),
    });

    res.redirect(303, '/profile');
  } catch (err) {
    console.error('❌ Profile update failed:', err);
    res.status(500).send('Profile update failed');
  }
});

// ---------------------------
// ADD MONEY
// ---------------------------
app.post('/add-money', requireAuth, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) return res.send('Invalid amount');

    const conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query('UPDATE users SET balance = balance + ? WHERE id=?', [amount, req.session.userId]);
    await conn.query(
      'INSERT INTO transactions (sender_id, receiver_id, type, amount, date) VALUES (?, ?, "credit", ?, NOW())',
      [req.session.userId, req.session.userId, amount]
    );

    await conn.commit();
    conn.release();

    console.log(`💰 Money added: ${req.session.email} +$${amount}`);

    // CloudWatch audit
    await fetch('https://ouuoixhdzj.execute-api.us-east-1.amazonaws.com/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: req.session.email,
        type: 'add-money',
        amount,
        timestamp: new Date().toISOString(),
      }),
    });

    res.redirect('/account');
  } catch (err) {
    console.error('❌ Add money failed:', err);
    res.status(500).send('Add money failed');
  }
});

// ---------------------------
// TRANSFER MONEY
// ---------------------------
app.post('/transfer', requireAuth, async (req, res) => {
  try {
    const { receiver, amount } = req.body;
    const amt = parseFloat(amount);
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

    console.log(`💸 Transfer completed: ${senderRows[0].email} -> ${receiver} : $${amt}`);

    // CloudWatch audit
    await fetch('https://ouuoixhdzj.execute-api.us-east-1.amazonaws.com/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: req.session.email,
        type: 'transfer',
        amount: amt,
        timestamp: new Date().toISOString(),
      }),
    });

    res.redirect('/account');
  } catch (err) {
    console.error('❌ Transfer failed:', err);
    res.status(500).send('Transfer failed');
  }
});

// ---------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on http://<elastic_ip>:${PORT}`);
});
