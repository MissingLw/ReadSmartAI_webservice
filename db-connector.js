const mysql = require('mysql');

var pool;
if(process.env.JAWSDB_URL) {  
  pool = mysql.createConnection(process.env.JAWSDB_URL);
} else {
  pool = mysql.createConnection({
    host: 'localhost',
    user: process.env.LOCAL_DB_USER,
    password: process.env.LOCAL_DB_PASSWORD,
    database: process.env.LOCAL_DB_DATABASE,
  });
}

pool.connect();
module.exports = pool;