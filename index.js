const http= require('node:http');
const fs= require('node:fs');
const sqlite = require('sqlite3');


const db = new sqlite.Database("my.db");

db.exec('CREATE TABLE grupos (id INTEGER,nombre TEXT, descripcion TEXT)');

console.log("Node.JS y SQlite")


const servidor = http.createServer((pedido,respuesta) =>{
    const url = new URL('http://localhost:8080' + pedido.url)
    let camino = 'public' + url.pathname
    if (camino == 'public/')
        camino = 'public/index.html'
    encaminar(pedido,respuesta,camino)


})


