// seed_mysql.js
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.banking-db.c6lmm0ime0ay.us-east-1.rds.amazonaws.com,
  user: process.env.admin,
  password: process.env.bank-cloud9,
  database: process.env.banking,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const users = [
  { full_name: 'Alice', email: 'alice@example.com', password: 'Password@123', balance: 5000.75 },
  { full_name: 'Bob', email: 'bob@example.com', password: 'Password@123', balance: 3250.50 },
  { full_name: 'Charlie', email: 'charlie@example.com', password: 'Password@123', balance: 870.00 },
  { full_name: 'Diana', email: 'diana@example.com', password: 'Password@123', balance: 10900.00 },
  { full_name: 'Eve', email: 'eve@example.com', password: 'Password@123', balance: 150.25 }
];

async function seed() {
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    pool.query(
      `INSERT INTO users (full_name, email, password, balance) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email=email`,
      [u.full_name, u.email, hash, u.balance],
      (err) => {
        if (err) console.error('Error inserting', u.email, err.message);
        else console.log(`✅ Inserted ${u.email}`);
      }
    );
  }

  setTimeout(() => {
    console.log('✅ MySQL seeding complete.');
    pool.end();
  }, 2000);
}

seed();
