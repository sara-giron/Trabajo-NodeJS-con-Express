// Rutas de usuarios: listado general y compañeros del mismo grupo
const express = require('express');
const db = require('../db/conexion');
const usuarios = require('../models/usuarios')(db);
const { requiereLogin } = require('../middleware/seguridad');

const router = express.Router();
router.use(requiereLogin);

// GET /usuarios -> listado de todos los usuarios
router.get('/', async (req, res, next) => {
  try {
    const yo = await usuarios.buscarPorId(req.session.usuario.id);
    const lista = await usuarios.listarTodos();
    res.render('usuarios/listado', {
      title: 'Listado de usuarios',
      usuarios: lista,
      yo,
      esAdmin: req.session.usuario.rol === 'admin',
    });
  } catch (err) {
    next(err);
  }
});

// GET /usuarios/grupo -> usuarios de mi grupo (a los que puedo escribir)
router.get('/grupo', async (req, res, next) => {
  try {
    const yo = await usuarios.buscarPorId(req.session.usuario.id);
    const companeros = await usuarios.companerosDeGrupo(req.session.usuario.id);
    res.render('usuarios/grupo', { title: 'Mi grupo', yo, companeros });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
