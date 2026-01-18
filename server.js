const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: 'smartbank-secret',
    resave: false,
    saveUninitialized: false,
  })
);

// ---------- DB ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// ---------- LOGIN ----------
app.get('/', (_, res) =>
  res.sendFile(path.join(__dirname, 'views/login.html'))
);

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email=? AND password=?',
    [email, password]
  );

  if (!rows.length) return res.send('Invalid credentials');

  req.session.userId = rows[0].id;
  res.redirect('/account');
});

// ---------- DASHBOARD ----------
app.get('/account', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  const [u] = await pool.query(
    'SELECT email,balance FROM users WHERE id=?',
    [req.session.userId]
  );

  let html = fs.readFileSync('views/account.html', 'utf8');
  html = html
    .replace('{{EMAIL}}', u[0].email)
    .replace('{{BALANCE}}', u[0].balance.toFixed(2));

  res.send(html);
});

// ---------- TRANSFER ----------
app.post('/transfer', async (req, res) => {
  const { receiver, amount } = req.body;

  await pool.query(
    'UPDATE users SET balance = balance - ? WHERE id=?',
    [amount, req.session.userId]
  );

  await pool.query(
    'UPDATE users SET balance = balance + ? WHERE email=?',
    [amount, receiver]
  );

  await pool.query(
    'INSERT INTO transactions (sender_id, receiver_email, amount, type) VALUES (?,?,?,?)',
    [req.session.userId, receiver, amount, 'TRANSFER']
  );

  res.redirect('/transactions');
});

// ---------- TRANSACTIONS ----------
app.get('/transactions', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  const [rows] = await pool.query(
    'SELECT * FROM transactions WHERE sender_id=? ORDER BY created_at DESC',
    [req.session.userId]
  );

  let items = rows.map(t => `
    <div class="tx ${t.type}">
      <b>${t.type}</b>
      <span>${t.receiver_email}</span>
      <span>$${t.amount}</span>
    </div>
  `).join('');

  let html = fs.readFileSync('views/transactions.html', 'utf8');
  html = html.replace('{{TX}}', items || '<p>No transactions</p>');

  res.send(html);
});

// ---------- PROFILE ----------
app.get('/profile', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  const [u] = await pool.query(
    'SELECT email,balance FROM users WHERE id=?',
    [req.session.userId]
  );

  let html = fs.readFileSync('views/profile.html', 'utf8');
  html = html
    .replace('{{EMAIL}}', u[0].email)
    .replace('{{BALANCE}}', u[0].balance);

  res.send(html);
});

// ---------- LOGOUT ----------
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.listen(PORT, () =>
  console.log(`✅ SmartBank running on port ${PORT}`)
);
