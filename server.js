const express = require('express');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = 3000;

/* -------------------- CONFIG -------------------- */
const JWT_SECRET = 'lambda-smartbank-secret'; // OK to hardcode in Lambda demo
const TOKEN_NAME = 'auth_token';

/* -------------------- MIDDLEWARE -------------------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* -------------------- DB (AWS RDS) -------------------- */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

/* -------------------- AUTH MIDDLEWARE -------------------- */
function auth(req, res, next) {
  const cookie = req.headers.cookie || '';
  const token = cookie
    .split('; ')
    .find(c => c.startsWith(TOKEN_NAME + '='))
    ?.split('=')[1];

  if (!token) return res.redirect('/');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.redirect('/');
  }
}

/* -------------------- LOGIN -------------------- */
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'views/login.html'));
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await pool.query(
    'SELECT id FROM users WHERE email=? AND password=?',
    [email, password]
  );

  if (!rows.length) return res.send('Invalid credentials');

  const token = jwt.sign(
    { userId: rows[0].id },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.setHeader(
    'Set-Cookie',
    `${TOKEN_NAME}=${token}; HttpOnly; Path=/`
  );

  res.redirect('/account');
});

/* -------------------- ACCOUNT -------------------- */
app.get('/account', auth, async (req, res) => {
  const [u] = await pool.query(
    'SELECT email,balance FROM users WHERE id=?',
    [req.userId]
  );

  let html = fs.readFileSync('views/account.html', 'utf8');
  html = html
    .replace('{{EMAIL}}', u[0].email)
    .replace('{{BALANCE}}', u[0].balance.toFixed(2));

  res.send(html);
});

/* -------------------- TRANSFER -------------------- */
app.post('/transfer', auth, async (req, res) => {
  const { receiver, amount } = req.body;
  const amt = parseFloat(amount);

  if (amt <= 0) return res.send('Invalid amount');

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[sender]] = await conn.query(
      'SELECT balance FROM users WHERE id=? FOR UPDATE',
      [req.userId]
    );

    if (sender.balance < amt) {
      await conn.rollback();
      return res.send('Insufficient balance');
    }

    const [[recv]] = await conn.query(
      'SELECT id FROM users WHERE email=? FOR UPDATE',
      [receiver]
    );

    if (!recv) {
      await conn.rollback();
      return res.send('Receiver not found');
    }

    await conn.query(
      'UPDATE users SET balance = balance - ? WHERE id=?',
      [amt, req.userId]
    );

    await conn.query(
      'UPDATE users SET balance = balance + ? WHERE email=?',
      [amt, receiver]
    );

    await conn.query(
      `INSERT INTO transactions (sender_id, receiver_email, amount, type)
       VALUES (?,?,?,?)`,
      [req.userId, receiver, amt, 'TRANSFER']
    );

    await conn.commit();

    /* 🔥 CloudWatch (automatic in Lambda) */
    console.log('TRANSFER', {
      senderId: req.userId,
      receiver,
      amount: amt,
      time: new Date().toISOString()
    });

    res.redirect('/transactions');
  } catch (err) {
    await conn.rollback();
    console.error('TRANSFER_ERROR', err);
    res.send('Transaction failed');
  } finally {
    conn.release();
  }
});

/* -------------------- TRANSACTIONS -------------------- */
app.get('/transactions', auth, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM transactions WHERE sender_id=? ORDER BY created_at DESC',
    [req.userId]
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

/* -------------------- PROFILE -------------------- */
app.get('/profile', auth, async (req, res) => {
  const [u] = await pool.query(
    'SELECT email,balance FROM users WHERE id=?',
    [req.userId]
  );

  let html = fs.readFileSync('views/profile.html', 'utf8');
  html = html
    .replace('{{EMAIL}}', u[0].email)
    .replace('{{BALANCE}}', u[0].balance.toFixed(2));

  res.send(html);
});

/* -------------------- LOGOUT -------------------- */
app.get('/logout', (_, res) => {
  res.setHeader(
    'Set-Cookie',
    `${TOKEN_NAME}=; HttpOnly; Max-Age=0; Path=/`
  );
  res.redirect('/');
});

/* -------------------- LOCAL DEV ONLY -------------------- */
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(PORT, () =>
    console.log(`✅ SmartBank running locally on ${PORT}`)
  );
}

module.exports = app;
