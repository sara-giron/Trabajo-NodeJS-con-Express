// Rutas de grupos (Parte 2 - David): alta, baja, listado y asignación de usuarios.
// Todas las rutas son solo para el administrador.
//
// Cada usuario pertenece como mucho a UN grupo porque en la tabla usuarios hay una
// sola columna grupo_id: al asignar un grupo nuevo se sustituye el anterior.
const express = require('express');
const db = require('../db/conexion');
const { requiereLogin, requiereAdmin, idValido } = require('../middleware/seguridad');

const router = express.Router();

// Primero hay que tener sesión y después ser admin
router.use(requiereLogin);
router.use(requiereAdmin);

// Muestra la página del listado. La usan GET /grupos y el alta cuando hay un error.
async function mostrarListado(res, error, nombre, descripcion) {
  // LEFT JOIN para que también salgan los grupos sin usuarios (con 0)
  const grupos = await db.all(
    `SELECT g.id, g.nombre, g.descripcion, COUNT(u.id) AS num_usuarios
       FROM grupos g
       LEFT JOIN usuarios u ON u.grupo_id = g.id
      GROUP BY g.id
      ORDER BY g.nombre`
  );
  res.render('grupos/listado', {
    title: 'Grupos',
    grupos: grupos,
    error: error,
    nombre: nombre,
    descripcion: descripcion,
  });
}

// GET /grupos -> listado de grupos y formulario de alta
router.get('/', async (req, res, next) => {
  try {
    await mostrarListado(res, null, '', '');
  } catch (err) {
    next(err);
  }
});

// POST /grupos -> alta de un grupo
router.post('/', async (req, res, next) => {
  const nombre = String(req.body.nombre || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();

  try {
    // Validaciones
    if (nombre === '') {
      return await mostrarListado(res, 'El nombre del grupo es obligatorio.', nombre, descripcion);
    }
    if (nombre.length > 50) {
      return await mostrarListado(res, 'El nombre no puede tener más de 50 caracteres.', nombre, descripcion);
    }
    if (descripcion.length > 200) {
      return await mostrarListado(res, 'La descripción no puede tener más de 200 caracteres.', nombre, descripcion);
    }

    // No puede haber dos grupos con el mismo nombre
    const repetido = await db.get('SELECT id FROM grupos WHERE nombre = ?', [nombre]);
    if (repetido) {
      return await mostrarListado(res, 'Ya existe un grupo con ese nombre.', nombre, descripcion);
    }

    await db.run('INSERT INTO grupos (nombre, descripcion) VALUES (?, ?)', [nombre, descripcion]);
    res.redirect('/grupos');
  } catch (err) {
    next(err);
  }
});

// GET /grupos/:id -> detalle del grupo: sus usuarios y formulario para asignar más
router.get('/:id', async (req, res, next) => {
  const grupoId = idValido(req.params.id);
  if (!grupoId) {
    return res.status(404).render('error', { message: 'Grupo no encontrado', error: {} });
  }

  try {
    const grupo = await db.get('SELECT id, nombre, descripcion FROM grupos WHERE id = ?', [grupoId]);
    if (!grupo) {
      return res.status(404).render('error', { message: 'Grupo no encontrado', error: {} });
    }

    // Usuarios que ya están en este grupo
    const miembros = await db.all(
      'SELECT id, usuario, nombre, apellidos FROM usuarios WHERE grupo_id = ? ORDER BY nombre',
      [grupoId]
    );

    // Usuarios que NO están en este grupo (para el desplegable de asignar).
    // Se muestra su grupo actual para que el admin sepa que se van a cambiar de grupo.
    const otros = await db.all(
      `SELECT u.id, u.usuario, u.nombre, u.apellidos, g.nombre AS grupo_actual
         FROM usuarios u
         LEFT JOIN grupos g ON g.id = u.grupo_id
        WHERE u.grupo_id IS NULL OR u.grupo_id <> ?
        ORDER BY u.nombre`,
      [grupoId]
    );

    res.render('grupos/detalle', {
      title: 'Grupo ' + grupo.nombre,
      grupo: grupo,
      miembros: miembros,
      otros: otros,
    });
  } catch (err) {
    next(err);
  }
});

// POST /grupos/:id/asignar -> mete a un usuario en este grupo
// Si ya estaba en otro grupo, se cambia (nunca puede estar en dos a la vez).
router.post('/:id/asignar', async (req, res, next) => {
  const grupoId = idValido(req.params.id);
  const usuarioId = idValido(req.body.usuario_id);
  if (!grupoId || !usuarioId) {
    return res.status(400).render('error', { message: 'Datos no válidos', error: {} });
  }

  try {
    // Comprobamos en la base de datos que existen el grupo y el usuario
    const grupo = await db.get('SELECT id FROM grupos WHERE id = ?', [grupoId]);
    if (!grupo) {
      return res.status(404).render('error', { message: 'Grupo no encontrado', error: {} });
    }
    const usuario = await db.get('SELECT id FROM usuarios WHERE id = ?', [usuarioId]);
    if (!usuario) {
      return res.status(404).render('error', { message: 'Usuario no encontrado', error: {} });
    }

    await db.run('UPDATE usuarios SET grupo_id = ? WHERE id = ?', [grupoId, usuarioId]);
    res.redirect('/grupos/' + grupoId);
  } catch (err) {
    next(err);
  }
});

// POST /grupos/:id/quitar -> saca a un usuario de este grupo (se queda sin grupo)
router.post('/:id/quitar', async (req, res, next) => {
  const grupoId = idValido(req.params.id);
  const usuarioId = idValido(req.body.usuario_id);
  if (!grupoId || !usuarioId) {
    return res.status(400).render('error', { message: 'Datos no válidos', error: {} });
  }

  try {
    // Solo se le quita si de verdad está en ESTE grupo
    await db.run('UPDATE usuarios SET grupo_id = NULL WHERE id = ? AND grupo_id = ?', [usuarioId, grupoId]);
    res.redirect('/grupos/' + grupoId);
  } catch (err) {
    next(err);
  }
});

// POST /grupos/:id/borrar -> baja del grupo
// Sus usuarios no se borran: se quedan sin grupo hasta que el admin les asigne otro.
router.post('/:id/borrar', async (req, res, next) => {
  const grupoId = idValido(req.params.id);
  if (!grupoId) {
    return res.status(404).render('error', { message: 'Grupo no encontrado', error: {} });
  }

  try {
    const grupo = await db.get('SELECT id FROM grupos WHERE id = ?', [grupoId]);
    if (!grupo) {
      return res.status(404).render('error', { message: 'Grupo no encontrado', error: {} });
    }

    // Primero dejamos a sus usuarios sin grupo y después borramos el grupo
    await db.run('UPDATE usuarios SET grupo_id = NULL WHERE grupo_id = ?', [grupoId]);
    await db.run('DELETE FROM grupos WHERE id = ?', [grupoId]);
    res.redirect('/grupos');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
