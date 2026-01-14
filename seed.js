// seed.js
const bcrypt = require('bcrypt');
const db = require('./db');

async function seed() {
  const users = [
    { email: 'alice@example.com', password: 'Password@123', balance: 5000.75 },
    { email: 'bob@example.com', password: 'Password@123', balance: 3250.50 },
    { email: 'charlie@example.com', password: 'Password@123', balance: 870.00 },
    { email: 'diana@example.com', password: 'Password@123', balance: 10900.00 },
    { email: 'eve@example.com', password: 'Password@123', balance: 150.25 }
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    db.run(
      'INSERT OR IGNORE INTO users(email, password, balance) VALUES (?, ?, ?)',
      [u.email, hash, u.balance],
      (err) => {
        if (err) console.error('Error inserting', u.email, err.message);
      }
    );
  }

  console.log('✅ Seed complete. Test users created:');
  users.forEach(u => console.log(`- ${u.email} / ${u.password} ($${u.balance})`));
  process.exit();
}
seed();
