// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

// node-fetch
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
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

pool.getConnection((err, conn) => {
  if (err) console.error('❌ DB connection failed:', err);
  else {
    console.log('✅ Connected to MySQL RDS');
    conn.release();
  }
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
  const hash = await bcrypt.hash(req.body.password, 10);
  pool.query(
    'INSERT INTO users (email, password) VALUES (?, ?)',
    [req.body.email, hash],
    err => (err ? res.send('Signup error') : res.redirect('/'))
  );
});

app.post('/login', (req, res) => {
  pool.query(
    'SELECT * FROM users WHERE email=?',
    [req.body.email],
    async (err, rows) => {
      if (err || !rows[0]) return res.send('Invalid login');

      const ok = await bcrypt.compare(req.body.password, rows[0].password);
      if (!ok) return res.send('Invalid login');

      req.session.userId = rows[0].id;
      req.session.email = rows[0].email;
      res.redirect('/account');
    }
  );
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------------------------
// ACCOUNT
// ---------------------------
app.get('/account', (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  pool.query(
    'SELECT email, balance FROM users WHERE id=?',
    [req.session.userId],
    (err, rows) => {
      if (err) return res.send('Error loading account');

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
    }
  );
});

// ---------------------------
// TRANSFER MONEY (FIXED)
// ---------------------------
app.post('/transfer', (req, res) => {
  console.log('🚀 /transfer route hit');

  if (!req.session.userId) return res.redirect('/');

  const receiver = req.body.receiver;
  const amt = parseFloat(req.body.amount);

  if (!receiver || isNaN(amt) || amt <= 0) {
    return res.send('Invalid transfer data');
  }

  console.log('SESSION EMAIL:', req.session.email);

  pool.getConnection((err, conn) => {
    if (err) return res.send('DB error');

    conn.beginTransaction(err => {
      if (err) {
        conn.release();
        return res.send('Transaction error');
      }

      conn.query(
        'SELECT * FROM users WHERE id=?',
        [req.session.userId],
        (err, senderRows) => {
          if (err || !senderRows[0] || senderRows[0].balance < amt) {
            return conn.rollback(() => {
              conn.release();
              res.send('Insufficient balance');
            });
          }

          conn.query(
            'SELECT * FROM users WHERE email=?',
            [receiver],
            (err, recvRows) => {
              if (err || !recvRows[0]) {
                return conn.rollback(() => {
                  conn.release();
                  res.send('Receiver not found');
                });
              }

              conn.query(
                'UPDATE users SET balance = balance - ? WHERE id=?',
                [amt, senderRows[0].id],
                err => {
                  if (err) {
                    return conn.rollback(() => {
                      conn.release();
                      res.send('Debit failed');
                    });
                  }

                  conn.query(
                    'UPDATE users SET balance = balance + ? WHERE id=?',
                    [amt, recvRows[0].id],
                    err => {
                      if (err) {
                        return conn.rollback(() => {
                          conn.release();
                          res.send('Credit failed');
                        });
                      }

                      conn.query(
                        'INSERT INTO transactions (sender_id, receiver_id, type, amount, date) VALUES (?, ?, "transfer", ?, NOW())',
                        [senderRows[0].id, recvRows[0].id, amt],
                        err => {
                          if (err) {
                            return conn.rollback(() => {
                              conn.release();
                              res.send('Transaction log failed');
                            });
                          }

                          conn.commit(err => {
                            if (err) {
                              return conn.rollback(() => {
                                conn.release();
                                res.send('Commit failed');
                              });
                            }

                            conn.release();
                            console.log('✅ DB transaction committed');

                            // 🔥 SERVERLESS AUDIT
                            console.log('📤 Sending audit to Lambda');

                            fetch('https://ouuoixhdzj.execute-api.us-east-1.amazonaws.com/audit', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                user: req.session.email,
                                amount: amt,
                                type: 'transfer',
                                timestamp: new Date().toISOString(),
                              }),
                            })
                              .then(r => r.json())
                              .then(d => console.log('✅ Lambda response:', d))
                              .catch(e => console.error('❌ Audit failed:', e.message));

                            res.redirect('/account');
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });
});

// ---------------------------
app.listen(PORT, () =>
  console.log(`✅ Server running on http://<elastic_ip>:${PORT}`)
);

