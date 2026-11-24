// Login y cierre de sesión (Parte 1 - Sara).
// Al iniciar sesión se guarda req.session.usuario = { id, nombre, rol },
// que es lo que usan las rutas de mensajes y de grupos.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/conexion');

const router = express.Router();

// GET /login -> formulario de login
router.get('/login', (req, res) => {
  // Si ya tiene sesión, no hace falta volver a entrar
  if (req.session.usuario) {
    return res.redirect('/');
  }
  res.render('login', { title: 'Iniciar sesión', error: null });
});

// POST /login -> comprueba usuario y contraseña
router.post('/login', async (req, res, next) => {
  const usuario = String(req.body.usuario || '').trim();
  const password = String(req.body.password || '');

  try {
    const fila = await db.get(
      'SELECT id, nombre, rol, password_hash FROM usuarios WHERE usuario = ?',
      [usuario]
    );

    // La contraseña se compara con el hash guardado (nunca se guarda en claro)
    let correcto = false;
    if (fila) {
      correcto = await bcrypt.compare(password, fila.password_hash);
    }

    // Mismo mensaje si falla el usuario o la contraseña, para no dar pistas
    if (!correcto) {
      return res.status(401).render('login', {
        title: 'Iniciar sesión',
        error: 'Usuario o contraseña incorrectos',
      });
    }

    // Se crea una sesión nueva al entrar (evita la fijación de sesión)
    req.session.regenerate(function (err) {
      if (err) {
        return next(err);
      }
      req.session.usuario = { id: fila.id, nombre: fila.nombre, rol: fila.rol };
      res.redirect('/');
    });
  } catch (err) {
    next(err);
  }
});

// POST /logout -> cierra la sesión
router.post('/logout', (req, res) => {
  req.session.destroy(function () {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
