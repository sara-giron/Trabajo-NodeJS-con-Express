// Administración de usuarios (Parte 1 - Sara): alta y baja de usuarios
// con sus datos personales y su foto. Solo para el administrador.
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db/conexion');
const { requiereLogin, requiereAdmin, idValido } = require('../middleware/seguridad');

const router = express.Router();

// Control de permisos: primero hay que tener sesión y después ser admin
router.use(requiereLogin);
router.use(requiereAdmin);

// --- Subida de fotos con multer ---
const CARPETA_FOTOS = path.join(__dirname, '../public/uploads');

// Tipos de imagen permitidos y la extensión que les ponemos
const TIPOS_PERMITIDOS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const almacen = multer.diskStorage({
  destination: CARPETA_FOTOS,
  // Nombre aleatorio: nunca usamos el nombre que manda el usuario
  filename: function (req, file, cb) {
    const nombre = crypto.randomBytes(16).toString('hex') + TIPOS_PERMITIDOS[file.mimetype];
    cb(null, nombre);
  },
});

const subirFoto = multer({
  storage: almacen,
  limits: { fileSize: 2 * 1024 * 1024 }, // máximo 2 MB
  fileFilter: function (req, file, cb) {
    if (TIPOS_PERMITIDOS[file.mimetype]) {
      cb(null, true);
    } else {
      req.fotoNoValida = true; // lo miramos después para avisar
      cb(null, false);
    }
  },
}).single('foto');

// Borra una foto de la carpeta (si no existe, no pasa nada)
function borrarFoto(nombreFichero) {
  if (!nombreFichero) {
    return;
  }
  fs.unlink(path.join(CARPETA_FOTOS, path.basename(nombreFichero)), function () {});
}

// Muestra el formulario de alta (vacío o con los datos y el error)
function mostrarFormulario(res, error, datos) {
  res.render('admin/nuevo-usuario', { title: 'Nuevo usuario', error: error, datos: datos });
}

// GET /admin -> lleva al listado de usuarios
router.get('/', (req, res) => {
  res.redirect('/admin/usuarios');
});

// GET /admin/usuarios -> listado de usuarios con sus datos
router.get('/usuarios', async (req, res, next) => {
  try {
    const usuarios = await db.all(
      `SELECT u.id, u.usuario, u.nombre, u.apellidos, u.email, u.foto, u.rol, g.nombre AS grupo
         FROM usuarios u
         LEFT JOIN grupos g ON g.id = u.grupo_id
        ORDER BY u.nombre`
    );
    res.render('admin/usuarios', {
      title: 'Administración de usuarios',
      usuarios: usuarios,
      yoId: req.session.usuario.id,
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/usuarios/nuevo -> formulario de alta
router.get('/usuarios/nuevo', (req, res) => {
  mostrarFormulario(res, null, {});
});

// POST /admin/usuarios -> alta de usuario (datos personales + foto)
router.post('/usuarios', subirFoto, async (req, res, next) => {
  const datos = {
    usuario: String(req.body.usuario || '').trim(),
    nombre: String(req.body.nombre || '').trim(),
    apellidos: String(req.body.apellidos || '').trim(),
    email: String(req.body.email || '').trim(),
    rol: String(req.body.rol || ''),
  };
  const password = String(req.body.password || '');
  let foto = null;
  if (req.file) {
    foto = req.file.filename;
  }

  // Validaciones (si algo falla, borramos la foto que se acaba de subir)
  let error = null;
  if (req.fotoNoValida) {
    error = 'La foto tiene que ser JPG, PNG o WEBP.';
  } else if (!/^[a-zA-Z0-9_.]{3,30}$/.test(datos.usuario)) {
    error = 'El usuario debe tener entre 3 y 30 letras, números, _ o .';
  } else if (password.length < 8) {
    error = 'La contraseña debe tener al menos 8 caracteres.';
  } else if (datos.nombre === '' || datos.nombre.length > 50) {
    error = 'El nombre es obligatorio (máximo 50 caracteres).';
  } else if (datos.apellidos.length > 100) {
    error = 'Los apellidos no pueden tener más de 100 caracteres.';
  } else if (datos.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) {
    error = 'El email no es válido.';
  } else if (datos.rol !== 'usuario' && datos.rol !== 'admin') {
    error = 'El rol no es válido.';
  }

  try {
    // No puede haber usuarios ni emails repetidos
    if (!error) {
      const mismoUsuario = await db.get('SELECT id FROM usuarios WHERE usuario = ?', [datos.usuario]);
      if (mismoUsuario) {
        error = 'Ese nombre de usuario ya existe.';
      }
    }
    if (!error && datos.email !== '') {
      const mismoEmail = await db.get('SELECT id FROM usuarios WHERE email = ?', [datos.email]);
      if (mismoEmail) {
        error = 'Ese email ya está registrado.';
      }
    }

    if (error) {
      borrarFoto(foto);
      return mostrarFormulario(res, error, datos);
    }

    // La contraseña se guarda cifrada con bcrypt. El grupo se asigna en /grupos.
    const hash = await bcrypt.hash(password, 10);
    let email = null;
    if (datos.email !== '') {
      email = datos.email;
    }
    await db.run(
      `INSERT INTO usuarios (usuario, password_hash, nombre, apellidos, email, foto, rol)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [datos.usuario, hash, datos.nombre, datos.apellidos, email, foto, datos.rol]
    );
    res.redirect('/admin/usuarios');
  } catch (err) {
    borrarFoto(foto);
    next(err);
  }
});

// POST /admin/usuarios/:id/borrar -> baja de usuario
router.post('/usuarios/:id/borrar', async (req, res, next) => {
  const usuarioId = idValido(req.params.id);
  if (!usuarioId) {
    return res.status(404).render('error', { message: 'Usuario no encontrado', error: {} });
  }

  // El admin no puede borrarse a sí mismo
  if (usuarioId === req.session.usuario.id) {
    return res.status(400).render('error', { message: 'No puedes darte de baja a ti mismo', error: {} });
  }

  try {
    const usuario = await db.get('SELECT id, foto FROM usuarios WHERE id = ?', [usuarioId]);
    if (!usuario) {
      return res.status(404).render('error', { message: 'Usuario no encontrado', error: {} });
    }

    // Primero sus mensajes, después el usuario y por último su foto
    await db.run('DELETE FROM mensajes WHERE remitente_id = ? OR destinatario_id = ?', [usuarioId, usuarioId]);
    await db.run('DELETE FROM usuarios WHERE id = ?', [usuarioId]);
    borrarFoto(usuario.foto);
    res.redirect('/admin/usuarios');
  } catch (err) {
    next(err);
  }
});

// Errores de multer (por ejemplo, foto de más de 2 MB)
router.use(function (err, req, res, next) {
  if (err instanceof multer.MulterError) {
    let mensaje = 'Error al subir la foto.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      mensaje = 'La foto no puede pasar de 2 MB.';
    }
    return mostrarFormulario(res, mensaje, {});
  }
  next(err);
});

module.exports = router;
