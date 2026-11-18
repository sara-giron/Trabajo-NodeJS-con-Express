// Middlewares de seguridad compartidos.
// CONTRATO con la parte de login: al iniciar sesión se debe guardar
//   req.session.usuario = { id, nombre, rol }
const crypto = require('crypto');

// Exige sesión iniciada
function requiereLogin(req, res, next) {
  if (req.session && req.session.usuario && Number.isInteger(req.session.usuario.id)) {
    return next();
  }
  return res.redirect('/login');
}

// Exige rol de administrador (para la parte de altas/bajas)
function requiereAdmin(req, res, next) {
  if (req.session.usuario && req.session.usuario.rol === 'admin') return next();
  return res.status(403).render('error', { message: 'Acceso solo para administradores', error: {} });
}

// Token CSRF por sesión: se genera una vez y se comprueba en cada POST.
function csrf(req, res, next) {
  if (!req.session) return next();
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;

  if (req.method === 'POST') {
    const enviado = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
    const esperado = req.session.csrf;
    const valido =
      enviado.length === esperado.length &&
      crypto.timingSafeEqual(Buffer.from(enviado), Buffer.from(esperado));
    if (!valido) {
      return res.status(403).render('error', { message: 'Petición no válida (CSRF)', error: {} });
    }
  }
  next();
}

// Convierte un parámetro de la URL en un id entero positivo (o null)
function idValido(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { requiereLogin, requiereAdmin, csrf, idValido };
