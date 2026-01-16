// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

// node-fetch (for serverless audit)
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
// DATABASE (AWS RDS MySQL)
// ---------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'banking-db.c6lmm0ime0ay.us-east-1.rds.amazonaws.com',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASS || 'bank-cloud9',
  database: process.env.DB_NAME || 'banking',
  waitForConnections: true,
  connectionLimit: 10
});

pool.getConnection((err, conn) => {
  if (err) console.error('❌ DB connection failed:', err);
  else {
    console.log('✅ Connected to MySQL RDS');
    conn.release();
  }
});

// ---------------------------
// CREATE TABLES
// ---------------------------
const createTables = () => {
  pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      balance DECIMAL(10,2) DEFAULT 0,
      full_name VARCHAR(255),
      phone VARCHAR(50),
      address VARCHAR(255),
      account_number VARCHAR(20)
    )
  `);

  pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sender_id INT,
      receiver_id INT,
      type VARCHAR(50),
      amount DECIMAL(10,2),
      date DATETIME
    )
  `);
};
createTables();

// ---------------------------
// ROUTES
// ---------------------------
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'views/login.html')));
app.get('/signup', (_, res) => res.sendFile(path.join(__dirname, 'views/signup.html')));

// ---------------------------
// AUTH
// ---------------------------
app.post('/signup', async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 10);
  pool.query(
    'INSERT INTO users (email, password) VALUES (?, ?)',
    [req.body.email, hash],
    err => err ? res.send('Signup error') : res.redirect('/')
  );
});

app.post('/login', (req, res) => {
  pool.query(
    'SELECT * FROM users WHERE email=?',
    [req.body.email],
    async (err, r) => {
      if (err || !r[0]) return res.send('Invalid login');
      const ok = await bcrypt.compare(req.body.password, r[0].password);
      if (!ok) return res.send('Invalid login');

      req.session.userId = r[0].id;
      req.session.email = r[0].email;
      res.redirect('/account');
    }
  );
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------------------------
// ACCOUNT DASHBOARD
// ---------------------------
app.get('/account', (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  pool.query(
    'SELECT email, balance FROM users WHERE id=?',
    [req.session.userId],
    (err, r) => {
      if (err) return res.send('Error');

      res.send(`
        <h2>Welcome ${r[0].email}</h2>
        <h3>Balance: $${r[0].balance}</h3>

        <form method="POST" action="/transfer">
          <input name="receiver" placeholder="Receiver Email" required />
          <input name="amount" type="number" step="0.01" required />
          <button>Transfer</button>
        </form>

        <a href="/logout">Logout</a>
      `);
    }
  );
});

// ---------------------------
// TRANSFER MONEY (🔥 MAIN FIX HERE)
// ---------------------------
app.post('/transfer', (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  const receiver = req.body.receiver;
  const amt = parseFloat(req.body.amount);

  if (!receiver || isNaN(amt) || amt <= 0) {
    return res.send('Invalid transfer data');
  }

  pool.getConnection((err, conn) => {
    if (err) return res.send('DB error');

    conn.query(
      'SELECT * FROM users WHERE id=?',
      [req.session.userId],
      (err, senderRows) => {
        const sender = senderRows[0];
        if (sender.balance < amt) {
          conn.release();
          return res.send('Insufficient balance');
        }

        conn.query(
          'SELECT * FROM users WHERE email=?',
          [receiver],
          (err, recvRows) => {
            if (err || !recvRows[0]) {
              conn.release();
              return res.send('Receiver not found');
            }

            const receiverUser = recvRows[0];

            conn.beginTransaction(() => {
              conn.query(
                'UPDATE users SET balance = balance - ? WHERE id=?',
                [amt, sender.id]
              );

              conn.query(
                'UPDATE users SET balance = balance + ? WHERE id=?',
                [amt, receiverUser.id]
              );

              conn.query(
                'INSERT INTO transactions (sender_id, receiver_id, type, amount, date) VALUES (?, ?, "transfer", ?, NOW())',
                [sender.id, receiverUser.id, amt],
                () => {
                  conn.commit(() => {
                    conn.release();

                    // 🔥 SERVERLESS AUDIT (CloudWatch)
                    fetch("https://ouuoixhdzj.execute-api.us-east-1.amazonaws.com/audit", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        user: req.session.email,
                        amount: amt,
                        type: "transfer",
                        timestamp: new Date().toISOString()
                      })
                    }).catch(err =>
                      console.error("Audit failed:", err.message)
                    );

                    res.redirect('/account');
                  });
                }
              );
            });
          }
        );
      }
    );
  });
});

// ---------------------------
app.listen(PORT, () =>
  console.log(`✅ Server running at http://<elastic_ip>:${PORT}`)
);
