const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

/* ---------------------------
   DATABASE
--------------------------- */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
});

/* ---------------------------
   MIDDLEWARE
--------------------------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: 'bank-secret-key',
    resave: false,
    saveUninitialized: false,
  })
);

/* ---------------------------
   AUTH ROUTES
--------------------------- */

// Login page
app.get('/', (_, res) =>
  res.sendFile(path.join(__dirname, 'views/login.html'))
);

// Register page
app.get('/signup', (_, res) =>
  res.sendFile(path.join(__dirname, 'views/register.html'))
);

// Login logic
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

// Register logic
app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  await pool.query(
    'INSERT INTO users (email, password, balance) VALUES (?,?,?)',
    [email, password, 1000]
  );

  res.redirect('/');
});

/* ---------------------------
   DASHBOARD
--------------------------- */
app.get('/account', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  const [rows] = await pool.query(
    'SELECT email, balance FROM users WHERE id=?',
    [req.session.userId]
  );

  let html = fs.readFileSync('views/account.html', 'utf8');
  html = html
    .replace('{{EMAIL}}', rows[0].email)
    .replace('{{BALANCE}}', rows[0].balance.toFixed(2));

  res.send(html);
});

/* ---------------------------
   PROFILE
--------------------------- */
app.get('/profile', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  const [rows] = await pool.query(
    'SELECT id,email,balance,created_at FROM users WHERE id=?',
    [req.session.userId]
  );

  let html = fs.readFileSync('views/profile.html', 'utf8');
  html = html
    .replace('{{ID}}', rows[0].id)
    .replace('{{EMAIL}}', rows[0].email)
    .replace('{{BALANCE}}', rows[0].balance)
    .replace('{{CREATED}}', rows[0].created_at);

  res.send(html);
});

/* ---------------------------
   TRANSACTIONS
--------------------------- */
app.get('/transactions', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  const [rows] = await pool.query(
    'SELECT * FROM transactions WHERE sender_id=? ORDER BY created_at DESC',
    [req.session.userId]
  );

  let table = rows.map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${t.receiver_email}</td>
      <td>${t.amount}</td>
      <td>${t.type}</td>
      <td>${t.created_at}</td>
    </tr>
  `).join('');

  let html = fs.readFileSync('views/transactions.html', 'utf8');
  html = html.replace('{{ROWS}}', table || '<tr><td colspan="5">No transactions</td></tr>');

  res.send(html);
});

/* ---------------------------
   TRANSFER
--------------------------- */
app.post('/transfer', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');

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

/* ---------------------------
   LOGOUT
--------------------------- */
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

/* ---------------------------
   SERVER
--------------------------- */
app.listen(3000, () =>
  console.log('✅ Server running on http://<elastic_ip>:3000')
);
