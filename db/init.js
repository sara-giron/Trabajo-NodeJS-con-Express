// Crea las tablas y, con --seed, carga datos de prueba.
//   npm run initdb   -> solo tablas
//   npm run seed     -> tablas + datos de ejemplo (contraseña de todos: 1234)
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./conexion');

async function main() {
  const esquema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.exec(esquema);
  console.log('Tablas creadas en', db.RUTA_BD);

  if (process.argv.includes('--seed')) {
    await db.exec('DELETE FROM mensajes; DELETE FROM usuarios; DELETE FROM grupos;');
    const hash = bcrypt.hashSync('1234', 10);

    const g1 = (await db.run('INSERT INTO grupos (nombre, descripcion) VALUES (?, ?)', ['Desarrollo', 'Equipo de desarrollo'])).lastID;
    const g2 = (await db.run('INSERT INTO grupos (nombre, descripcion) VALUES (?, ?)', ['Sistemas', 'Equipo de sistemas'])).lastID;

    const usuarios = [
      ['admin', 'Administrador', '', 'admin@demo.local', 'admin', null],
      ['ana', 'Ana', 'García', 'ana@demo.local', 'usuario', g1],
      ['luis', 'Luis', 'Pérez', 'luis@demo.local', 'usuario', g1],
      ['marta', 'Marta', 'López', 'marta@demo.local', 'usuario', g1],
      ['pablo', 'Pablo', 'Ruiz', 'pablo@demo.local', 'usuario', g2],
      ['sara', 'Sara', 'Martín', 'sara@demo.local', 'usuario', g2],
    ];
    for (const [usuario, nombre, apellidos, email, rol, grupo] of usuarios) {
      await db.run(
        'INSERT INTO usuarios (usuario, password_hash, nombre, apellidos, email, rol, grupo_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [usuario, hash, nombre, apellidos, email, rol, grupo]
      );
    }
    await db.run(
      `INSERT INTO mensajes (remitente_id, destinatario_id, contenido)
       SELECT a.id, b.id, 'Hola Luis, ¿revisamos el proyecto mañana?'
       FROM usuarios a, usuarios b WHERE a.usuario = 'ana' AND b.usuario = 'luis'`
    );
    console.log('Datos de prueba cargados (usuarios: admin, ana, luis, marta, pablo, sara / contraseña 1234)');
  }
  db.conexion.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
