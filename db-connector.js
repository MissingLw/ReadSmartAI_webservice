const mysql = require('mysql');

var pool;
if(process.env.JAWSDB_URL) {  
  pool = mysql.createConnection(process.env.JAWSDB_URL);
} else {
  pool = mysql.createConnection({
    host: 'qbct6vwi8q648mrn.cbetxkdyhwsb.us-east-1.rds.amazonaws.com',
    user: 'i9bu6klyaf9ude4i',
    password: 'c1k19uiwp0jbgyb6',
    port: 3306,
    database: 'bl7zp8lw6hw1qaz7',
  });
}

pool.connect();
module.exports = pool;