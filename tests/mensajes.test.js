// Pruebas de la lógica de usuarios y mensajes (sin servidor ni dependencias npm).
// Usa el SQLite integrado de Node (>= 22.5):  npm test
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Adaptador con la misma interfaz que db/conexion.js, pero en memoria
const sqlite = new DatabaseSync(':memory:');
const db = {
  all: async (sql, p = []) => sqlite.prepare(sql).all(...p),
  get: async (sql, p = []) => sqlite.prepare(sql).get(...p),
  run: async (sql, p = []) => {
    const r = sqlite.prepare(sql).run(...p);
    return { lastID: Number(r.lastInsertRowid), changes: r.changes };
  },
};

const usuarios = require('../models/usuarios')(db);
const mensajes = require('../models/mensajes')(db);
const ids = {};

before(() => {
  sqlite.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  sqlite.exec(`
    INSERT INTO grupos (id, nombre) VALUES (1, 'Desarrollo'), (2, 'Sistemas');
    INSERT INTO usuarios (id, usuario, password_hash, nombre, rol, grupo_id) VALUES
      (1, 'admin', 'x', 'Admin', 'admin', NULL),
      (2, 'ana',   'x', 'Ana',   'usuario', 1),
      (3, 'luis',  'x', 'Luis',  'usuario', 1),
      (4, 'marta', 'x', 'Marta', 'usuario', 1),
      (5, 'pablo', 'x', 'Pablo', 'usuario', 2);
  `);
  Object.assign(ids, { admin: 1, ana: 2, luis: 3, marta: 4, pablo: 5 });
});

test('el listado no expone contraseñas', async () => {
  const lista = await usuarios.listarTodos();
  assert.strictEqual(lista.length, 5);
  assert.ok(lista.every((u) => !('password_hash' in u)));
});

test('compañeros de grupo: solo los del mismo grupo y sin uno mismo', async () => {
  const comp = await usuarios.companerosDeGrupo(ids.ana);
  assert.deepStrictEqual(comp.map((u) => u.usuario).sort(), ['luis', 'marta']);
  assert.deepStrictEqual(await usuarios.companerosDeGrupo(ids.admin), []);
});

test('envío y almacenamiento entre usuarios del mismo grupo', async () => {
  const id = await mensajes.enviar(ids.ana, ids.luis, '  Hola Luis  ');
  const fila = await db.get('SELECT * FROM mensajes WHERE id = ?', [id]);
  assert.strictEqual(fila.remitente_id, ids.ana);
  assert.strictEqual(fila.destinatario_id, ids.luis);
  assert.strictEqual(fila.contenido, 'Hola Luis');
  assert.strictEqual(fila.leido, 0);
});

test('no se puede enviar a otro grupo, a uno mismo, ni sin grupo', async () => {
  await assert.rejects(mensajes.enviar(ids.ana, ids.pablo, 'hola'), { status: 403 });
  await assert.rejects(mensajes.enviar(ids.admin, ids.ana, 'hola'), { status: 403 });
  await assert.rejects(mensajes.enviar(ids.ana, ids.ana, 'hola'), { status: 400 });
  await assert.rejects(mensajes.enviar(ids.ana, 999, 'hola'), { status: 403 });
});

test('validación del contenido', async () => {
  await assert.rejects(mensajes.enviar(ids.ana, ids.luis, '   '), { status: 400 });
  await assert.rejects(mensajes.enviar(ids.ana, ids.luis, undefined), { status: 400 });
  await assert.rejects(mensajes.enviar(ids.ana, ids.luis, 'x'.repeat(1001)), { status: 400 });
});

test('el historial solo contiene mensajes entre los dos participantes', async () => {
  await mensajes.enviar(ids.luis, ids.ana, 'Hola Ana');
  await mensajes.enviar(ids.luis, ids.marta, 'Mensaje privado para Marta');

  const { mensajes: hist, puedeEscribir } = await mensajes.historial(ids.ana, ids.luis);
  assert.strictEqual(puedeEscribir, true);
  assert.deepStrictEqual(hist.map((m) => m.contenido), ['Hola Luis', 'Hola Ana']);
  assert.ok(hist.every((m) => m.remitente_id === ids.ana || m.destinatario_id === ids.ana));
});

test('un usuario no puede leer conversaciones ajenas', async () => {
  // Ana pide su historial con Marta: no debe ver el mensaje de Luis a Marta
  const { mensajes: hist } = await mensajes.historial(ids.ana, ids.marta);
  assert.strictEqual(hist.length, 0);
  // Pablo (otro grupo) no puede abrir conversación con Ana
  await assert.rejects(mensajes.historial(ids.pablo, ids.ana), { status: 403 });
  // El admin tampoco puede leer mensajes de los usuarios
  await assert.rejects(mensajes.historial(ids.admin, ids.luis), { status: 403 });
  await assert.rejects(mensajes.historial(ids.ana, 999), { status: 404 });
});

test('la bandeja muestra no leídos y marcar como leído solo afecta al destinatario', async () => {
  assert.strictEqual(await mensajes.totalNoLeidos(ids.ana), 1);
  // Luis "marca leídos" su conversación con Ana: no debe tocar lo que Ana no ha leído
  await mensajes.marcarLeidos(ids.luis, ids.ana);
  assert.strictEqual(await mensajes.totalNoLeidos(ids.ana), 1);

  const bandeja = await mensajes.conversaciones(ids.ana);
  const conLuis = bandeja.find((c) => c.id === ids.luis);
  assert.strictEqual(conLuis.no_leidos, 1);
  assert.strictEqual(conLuis.ultimo_mensaje, 'Hola Ana');
  assert.ok(!bandeja.some((c) => c.id === ids.pablo));

  await mensajes.marcarLeidos(ids.ana, ids.luis);
  assert.strictEqual(await mensajes.totalNoLeidos(ids.ana), 0);
});

test('si cambian a alguien de grupo, se conserva el historial pero no se puede responder', async () => {
  await db.run('UPDATE usuarios SET grupo_id = 2 WHERE id = ?', [ids.luis]);
  const { mensajes: hist, puedeEscribir } = await mensajes.historial(ids.ana, ids.luis);
  assert.strictEqual(hist.length, 2);
  assert.strictEqual(puedeEscribir, false);
  await assert.rejects(mensajes.enviar(ids.ana, ids.luis, 'sigo aquí'), { status: 403 });

  const conLuis = (await mensajes.conversaciones(ids.ana)).find((c) => c.id === ids.luis);
  assert.strictEqual(conLuis.mismo_grupo, 0);
  await db.run('UPDATE usuarios SET grupo_id = 1 WHERE id = ?', [ids.luis]);
});

test('al dar de baja a un usuario se borran sus mensajes', async () => {
  sqlite.exec('PRAGMA foreign_keys = ON');
  await db.run('DELETE FROM usuarios WHERE id = ?', [ids.marta]);
  const quedan = await db.get('SELECT COUNT(*) AS n FROM mensajes WHERE destinatario_id = ? OR remitente_id = ?', [ids.marta, ids.marta]);
  assert.strictEqual(quedan.n, 0);
});
