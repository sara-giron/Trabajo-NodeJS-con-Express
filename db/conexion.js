// Conexión única a SQLite con funciones que devuelven promesas (para usar async/await)
const sqlite3 = require('sqlite3');
const path = require('path');

const RUTA_BD = process.env.DB_PATH || path.join(__dirname, 'app.db');
const conexion = new sqlite3.Database(RUTA_BD);

// Las claves foráneas en SQLite se activan por conexión
conexion.run('PRAGMA foreign_keys = ON');

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    conexion.all(sql, params, (err, filas) => (err ? reject(err) : resolve(filas)));
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    conexion.get(sql, params, (err, fila) => (err ? reject(err) : resolve(fila)));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    conexion.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    conexion.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

module.exports = { all, get, run, exec, conexion, RUTA_BD };
