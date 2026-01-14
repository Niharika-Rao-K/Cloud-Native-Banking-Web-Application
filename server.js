// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// ✅ REQUIRED to read form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------------------------
// DATABASE
// ---------------------------
const db = new sqlite3.Database('users.sqlite', (err) => {
  if (err) console.error('Error opening database', err);
  else console.log('Connected to users.sqlite');
});

// ---------------------------
// MIDDLEWARES
// ---------------------------
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true,
  })
);

// ---------------------------
// CREATE TABLES
// ---------------------------
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password TEXT,
  balance REAL DEFAULT 0,
  full_name TEXT,
  phone TEXT,
  address TEXT,
  account_number TEXT
)`);


  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    type TEXT,
    amount REAL,
    date TEXT
  )`);
});

// ---------------------------
// ROUTES
// ---------------------------

// Root → Login Page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Signup Page
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});

// Handle Signup
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  db.run(`INSERT INTO users (email, password, balance) VALUES (?, ?, 0)`, [email, hash], (err) => {
    if (err) return res.send('Error creating account. Try another email.');
    res.redirect('/');
  });
});

// Handle Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) return res.send('Invalid email or password');
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send('Invalid email or password');

    req.session.userId = user.id;
    req.session.email = user.email;
    res.redirect('/account');
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------------------------
// ACCOUNT DASHBOARD
// ---------------------------
app.get('/account', (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  db.get('SELECT email, balance FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err || !user) return res.status(500).send('Error loading account');

    res.send(`
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>SmartBank Dashboard</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"/>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" rel="stylesheet"/>
        <style>
          body {
            background: linear-gradient(to right, #e0f7fa, #b2ebf2);
            min-height: 100vh;
            font-family: 'Poppins', sans-serif;
          }
          .dashboard-card {
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 8px 20px rgba(0,0,0,0.15);
            background: #fff;
          }
          .balance-box {
            background: linear-gradient(90deg, #26a69a, #00796b);
            color: #fff;
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            font-size: 2rem;
            font-weight: 600;
            margin-bottom: 30px;
          }
          .section-box {
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 25px;
          }
          .section-box h5 {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 600;
          }
          .section-box i {
            font-size: 1.6rem;
            color: #00796b;
          }
          .btn-custom {
            border-radius: 12px;
            transition: all 0.2s ease-in-out;
          }
          .btn-custom:hover {
            transform: scale(1.05);
          }
        </style>
      </head>

      <body>
        <div class="container py-5">
          <div class="dashboard-card p-5 mx-auto" style="max-width: 600px;">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h3><i class="fa-solid fa-building-columns text-primary"></i> SmartBank</h3>
              <form method="GET" action="/logout">
                <button class="btn btn-outline-danger btn-sm">
                  <i class="fa-solid fa-right-from-bracket"></i> Logout
                </button>
              </form>
            </div>

            <h5 class="text-muted mb-3"><i class="fa-solid fa-user"></i> Welcome, ${user.email}</h5>

            <div class="balance-box shadow-sm mb-4">
              <i class="fa-solid fa-wallet"></i> $${user.balance.toFixed(2)}
            </div>

            <div class="section-box" style="background:#acdbf2;">
              <h5><i class="fa-solid fa-money-bill-wave"></i> Add Money</h5>
              <form method="POST" action="/add-money" class="mt-3">
                <div class="input-group">
                  <input name="amount" type="number" step="0.01" class="form-control" placeholder="Enter amount" required />
                  <button class="btn btn-success btn-custom" type="submit" style="background-color:#75c78b; border-color:#75c78b;">
                    <i class="fa-solid fa-circle-plus"></i> Add
                  </button>
                </div>
              </form>
            </div>

            <div class="section-box" style="background:#d9f5ba;">
              <h5><i class="fa-solid fa-paper-plane"></i> Transfer Money</h5>
              <form method="POST" action="/transfer" class="mt-3">
                <input name="receiver" type="email" class="form-control mb-2" placeholder="Recipient Email" required />
                <div class="input-group">
                  <input name="amount" type="number" step="0.01" class="form-control" placeholder="Amount" required />
                  <button class="btn btn-primary btn-custom" type="submit" style="background-color:#99c9f0; border-color:#99c9f0;">
                    <i class="fa-solid fa-money-bill-transfer"></i> Send
                  </button>
                </div>
              </form>
            </div>

            <div class="d-grid gap-2 mt-4">
              <a href="/transactions" class="btn btn-outline-info btn-custom">
                <i class="fa-solid fa-list"></i> View Transactions
              </a>
              <a href="/profile" class="btn btn-outline-warning btn-custom">
                <i class="fa-solid fa-user-gear"></i> Profile Settings
              </a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// ---------------------------
// ADD MONEY
// ---------------------------
app.post('/add-money', (req, res) => {
  if (!req.session.userId) return res.redirect('/');
  const amount = parseFloat(req.body.amount);

  db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, req.session.userId], function (err) {
    if (err) return res.send('Error depositing money');
    db.run(
      `INSERT INTO transactions (sender_id, receiver_id, type, amount, date)
       VALUES (?, ?, 'deposit', ?, datetime('now'))`,
      [req.session.userId, req.session.userId, amount]
    );
    res.redirect('/account');
  });
});

// ---------------------------
// TRANSFER
// ---------------------------
app.post('/transfer', (req, res) => {
  if (!req.session.userId) return res.redirect('/');
  const { receiver, amount } = req.body;
  const amt = parseFloat(amount);

  db.get(`SELECT * FROM users WHERE email = ?`, [receiver], (err, user) => {
    if (err || !user) return res.send('Receiver not found');
    if (receiver === req.session.email) return res.send('Cannot transfer to yourself');

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [amt, req.session.userId]);
      db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amt, user.id]);
      db.run(
        `INSERT INTO transactions (sender_id, receiver_id, type, amount, date)
         VALUES (?, ?, 'transfer', ?, datetime('now'))`,
        [req.session.userId, user.id, amt]
      );
      db.run('COMMIT', (e) => {
        if (e) return res.send('Transaction failed');
        res.redirect('/account');
      });
    });
  });
});

// ---------------------------
// TRANSACTIONS PAGE
// ---------------------------
app.get('/transactions', (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  db.all(
    `
    SELECT t.*, u1.email AS sender_email, u2.email AS receiver_email
    FROM transactions t
    LEFT JOIN users u1 ON t.sender_id = u1.id
    LEFT JOIN users u2 ON t.receiver_id = u2.id
    WHERE t.sender_id = ? OR t.receiver_id = ?
    ORDER BY t.date DESC
  `,
    [req.session.userId, req.session.userId],
    (err, rows) => {
      if (err) return res.status(500).send('Error fetching transactions');

      const html = rows
        .map((t) => {
          const isOutgoing = t.sender_email === req.session.email;
          const badgeClass =
            t.type === 'deposit' ? 'success' : isOutgoing ? 'danger' : 'primary';
          const sign = t.type === 'deposit' ? '+' : isOutgoing ? '-' : '+';
          const desc =
            t.type === 'deposit'
              ? 'Added funds'
              : isOutgoing
              ? `Sent to ${t.receiver_email}`
              : `Received from ${t.sender_email}`;

          return `
            <div class="card shadow-sm mb-3 border-${badgeClass}">
              <div class="card-body d-flex justify-content-between align-items-center">
                <div>
                  <h6 class="text-${badgeClass} mb-1">
                    <i class="fa-solid ${
                      t.type === 'deposit'
                        ? 'fa-circle-plus'
                        : isOutgoing
                        ? 'fa-paper-plane'
                        : 'fa-inbox'
                    }"></i> ${t.type.toUpperCase()}
                  </h6>
                  <small class="text-muted">${desc}</small>
                </div>
                <div class="text-end">
                  <h5 class="${badgeClass === 'danger' ? 'text-danger' : 'text-success'}">
                    ${sign}$${t.amount.toFixed(2)}
                  </h5>
                  <small class="text-muted">${new Date(t.date).toLocaleString()}</small>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      res.send(`
        <html>
        <head>
          <title>Transactions</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"/>
          <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" rel="stylesheet"/>
        </head>
        <body class="bg-light">
          <div class="container py-5">
            <div class="card p-4 shadow-lg" style="max-width:700px;margin:auto;">
              <h3 class="mb-3 text-center"><i class="fa-solid fa-list"></i> Transaction History</h3>
              <input type="text" id="search" class="form-control mb-3" placeholder="Search transactions...">
              <div id="transactions">${html || '<p class="text-center text-muted">No transactions yet.</p>'}</div>
              <a href="/account" class="btn btn-outline-secondary w-100 mt-3">
                <i class="fa-solid fa-arrow-left"></i> Back
              </a>
            </div>
          </div>
          <script>
            const search = document.getElementById('search');
            search.addEventListener('input', () => {
              const val = search.value.toLowerCase();
              document.querySelectorAll('#transactions .card').forEach(card => {
                card.style.display = card.innerText.toLowerCase().includes(val) ? '' : 'none';
              });
            });
          </script>
        </body>
        </html>
      `);
    }
  );
});

// ---------------------------
// PROFILE PAGE
// ---------------------------
// ---------------------------
// PROFILE PAGE (GET)
// ---------------------------
// ---------------------------
// PROFILE PAGE (GET) - UPDATED
// ---------------------------
app.get('/profile', (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  db.get(
    'SELECT email, full_name, phone, address, account_number FROM users WHERE id = ?',
    [req.session.userId],
    (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).send('Database error loading profile');
      }

      if (!user) {
        console.error("User not found for id:", req.session.userId);
        return res.status(404).send('User not found');
      }

      // Generate account number if missing
      if (!user.account_number) {
        const acct = 'ACCT' + Math.floor(100000 + Math.random() * 900000);
        db.run(
          'UPDATE users SET account_number = ? WHERE id = ?',
          [acct, req.session.userId],
          function (updateErr) {
            if (updateErr) console.error("Error generating account number:", updateErr);
          }
        );
        user.account_number = acct;
      }

      try {
        res.send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>Profile Settings</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"/>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" rel="stylesheet"/>
          </head>
          <body class="bg-light d-flex justify-content-center align-items-center" style="min-height:100vh;">
            <div class="card p-4 shadow-lg" style="max-width:550px; width:100%;">
              <h3 class="text-center mb-3"><i class="fa-solid fa-user-gear"></i> Profile Settings</h3>
              <div class="alert alert-success"><strong>Account Number:</strong> ${user.account_number}</div>
              <form method="POST" action="/profile/update">
                <div class="mb-3">
                  <label class="form-label">Full Name</label>
                  <input type="text" name="full_name" class="form-control" value="${user.full_name || ''}" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Phone</label>
                  <input type="text" name="phone" class="form-control" value="${user.phone || ''}">
                </div>
                <div class="mb-3">
                  <label class="form-label">Address</label>
                  <textarea name="address" class="form-control">${user.address || ''}</textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Email</label>
                  <input type="email" name="email" class="form-control" value="${user.email}" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">New Password (optional)</label>
                  <input type="password" name="password" class="form-control">
                </div>
                <button class="btn btn-primary w-100">Save Changes</button>
              </form>
              <a href="/account" class="btn btn-outline-secondary w-100 mt-3">Back to Dashboard</a>
            </div>
          </body>
          </html>
        `);
      } catch (renderErr) {
        console.error("Error rendering profile page:", renderErr);
        res.status(500).send('Error rendering profile page');
      }
    }
  );
});

// ---------------------------
// PROFILE UPDATE (POST)
// ---------------------------
// ---------------------------
// PROFILE UPDATE (POST) - UPDATED
// ---------------------------
app.post('/profile/update', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');

  const { email, password, full_name, phone, address } = req.body;

  try {
    let query, params;

    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 10);
      query = `
        UPDATE users
        SET email = ?, password = ?, full_name = ?, phone = ?, address = ?
        WHERE id = ?
      `;
      params = [email, hash, full_name, phone, address, req.session.userId];
    } else {
      query = `
        UPDATE users
        SET email = ?, full_name = ?, phone = ?, address = ?
        WHERE id = ?
      `;
      params = [email, full_name, phone, address, req.session.userId];
    }

    db.run(query, params, function (err) {
      if (err) {
        console.error("Profile update error:", err.message);

        if (err.message.includes('UNIQUE')) {
          return res.status(400).send('Email already exists');
        }

        return res.status(500).send('Error updating profile');
      }

      // Update session email if changed
      req.session.email = email;
      res.redirect('/account');
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).send('Error updating profile');
  }
});

// ---------------------------
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));



