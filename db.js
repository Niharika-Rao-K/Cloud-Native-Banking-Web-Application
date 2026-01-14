// db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./users.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

// Ensure sequential execution and avoid SQLITE_BUSY
db.serialize();
db.configure("busyTimeout", 5000);

module.exports = db;
