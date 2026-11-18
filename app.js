const express = require('express');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');

const { csrf } = require('./middleware/seguridad');
const db = require('./db/conexion');
const mensajesModelo = require('./models/mensajes')(db);

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 2 },
  })
);
app.use(csrf);

// Datos disponibles en todas las vistas: usuario y nº de mensajes sin leer
app.use(async (req, res, next) => {
  res.locals.usuarioSesion = req.session.usuario || null;
  res.locals.noLeidos = 0;
  if (req.session.usuario) {
    try {
      res.locals.noLeidos = await mensajesModelo.totalNoLeidos(req.session.usuario.id);
    } catch (e) { /* no bloquear la página por el contador */ }
  }
  next();
});

// --- Rutas ---
app.use('/', require('./routes/login'));         // parte de login (compañero/a)
app.use('/usuarios', require('./routes/usuarios'));
app.use('/mensajes', require('./routes/mensajes'));
// app.use('/admin', require('./routes/admin'));  // altas/bajas de usuarios y grupos (compañero/a)

app.get('/', (req, res) => res.redirect(req.session.usuario ? '/mensajes' : '/login'));

// 404
app.use((req, res) => res.status(404).render('error', { message: 'Página no encontrada', error: {} }));

// Errores: no mostramos detalles internos fuera de desarrollo
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).render('error', {
    message: 'Se ha producido un error',
    error: req.app.get('env') === 'development' ? err : {},
  });
});

module.exports = app;
