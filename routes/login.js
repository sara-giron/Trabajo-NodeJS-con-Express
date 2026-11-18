// LOGIN PROVISIONAL para poder probar usuarios y mensajes.
// Sustituir por el login definitivo del compañero/a, respetando el contrato:
//   req.session.usuario = { id, nombre, rol }
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/conexion');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('login', { title: 'Iniciar sesión' });
});

router.post('/login', async (req, res, next) => {
  try {
    const usuario = String(req.body.usuario || '').trim();
    const password = String(req.body.password || '');
    const fila = await db.get(
      'SELECT id, nombre, rol, password_hash FROM usuarios WHERE usuario = ?',
      [usuario]
    );
    if (!fila || !bcrypt.compareSync(password, fila.password_hash)) {
      return res.status(401).render('login', { title: 'Iniciar sesión', error: 'Usuario o contraseña incorrectos' });
    }
    // Regenerar la sesión al iniciar evita la fijación de sesión
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.usuario = { id: fila.id, nombre: fila.nombre, rol: fila.rol };
      res.redirect('/mensajes');
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
