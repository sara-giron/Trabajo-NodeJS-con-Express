// Rutas de mensajería entre usuarios del mismo grupo
const express = require('express');
const db = require('../db/conexion');
const mensajes = require('../models/mensajes')(db);
const { requiereLogin, idValido } = require('../middleware/seguridad');

const router = express.Router();
router.use(requiereLogin);

// GET /mensajes -> bandeja con las conversaciones del usuario
router.get('/', async (req, res, next) => {
  try {
    const conversaciones = await mensajes.conversaciones(req.session.usuario.id);
    res.render('mensajes/bandeja', { title: 'Mensajes', conversaciones });
  } catch (err) {
    next(err);
  }
});

// GET /mensajes/:id -> historial con el usuario :id (+ formulario de envío)
router.get('/:id', async (req, res, next) => {
  const otroId = idValido(req.params.id);
  if (!otroId) return res.status(404).render('error', { message: 'Usuario no encontrado', error: {} });

  try {
    const yoId = req.session.usuario.id;
    const datos = await mensajes.historial(yoId, otroId);
    await mensajes.marcarLeidos(yoId, otroId);

    // Mensaje de error/borrador que venga de un POST fallido (patrón PRG)
    const aviso = req.session.aviso;
    delete req.session.aviso;

    res.render('mensajes/conversacion', {
      title: `Conversación con ${datos.otro.nombre}`,
      ...datos,
      aviso,
      maxLongitud: mensajes.MAX_LONGITUD,
    });
  } catch (err) {
    if (err instanceof mensajes.ErrorMensaje) {
      return res.status(err.status).render('error', { message: err.message, error: {} });
    }
    next(err);
  }
});

// POST /mensajes/:id -> enviar mensaje al usuario :id
// El remitente sale de la sesión; el formulario solo aporta el texto.
router.post('/:id', async (req, res, next) => {
  const otroId = idValido(req.params.id);
  if (!otroId) return res.status(404).render('error', { message: 'Usuario no encontrado', error: {} });

  try {
    await mensajes.enviar(req.session.usuario.id, otroId, req.body.contenido);
  } catch (err) {
    if (!(err instanceof mensajes.ErrorMensaje)) return next(err);
    if (err.status === 403) {
      return res.status(403).render('error', { message: err.message, error: {} });
    }
    req.session.aviso = { error: err.message, borrador: String(req.body.contenido || '').slice(0, mensajes.MAX_LONGITUD) };
  }
  res.redirect(`/mensajes/${otroId}`);
});

module.exports = router;
