const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('cs340_heardd', 'root', 'Marip0sa$3lCapitan$', {
  host: '127.0.0.1',
  port: 3308,
  dialect: 'mysql',
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
});

// db-connector.js

const mysql = require('mysql');

// Create a connection pool
const pool = mysql.createPool({
  connectionLimit: 10, // Maximum number of connections in pool
  host: '127.0.0.1',
  user: 'root',
  password: 'Marip0sa$3lCapitan$',
  database: 'readsmar_ai_test',
  port: 3308
});

module.exports = pool;