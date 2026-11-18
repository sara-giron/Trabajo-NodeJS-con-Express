// Lógica de mensajería: envío, almacenamiento, bandeja e historial.
// Reglas de seguridad aplicadas aquí (no solo en las vistas):
//  1. El remitente es siempre el usuario de la sesión, nunca un dato del formulario.
//  2. Solo se puede escribir a usuarios del MISMO grupo (comprobado en BD en cada envío).
//  3. Todas las consultas filtran por el usuario de la sesión: un usuario solo puede
//     leer mensajes en los que es remitente o destinatario.
//  4. Consultas parametrizadas (?) para evitar inyección SQL.

const crearModeloUsuarios = require('./usuarios');

const MAX_LONGITUD = 1000;

class ErrorMensaje extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.status = status;
  }
}

module.exports = function crearModeloMensajes(db) {
  const usuarios = crearModeloUsuarios(db);

  return {
    MAX_LONGITUD,
    ErrorMensaje,

    async enviar(remitenteId, destinatarioId, texto) {
      const contenido = typeof texto === 'string' ? texto.trim() : '';
      if (!contenido) throw new ErrorMensaje('El mensaje no puede estar vacío.', 400);
      if (contenido.length > MAX_LONGITUD) {
        throw new ErrorMensaje(`El mensaje no puede superar ${MAX_LONGITUD} caracteres.`, 400);
      }
      if (remitenteId === destinatarioId) {
        throw new ErrorMensaje('No puedes enviarte mensajes a ti mismo.', 400);
      }
      if (!(await usuarios.mismoGrupo(remitenteId, destinatarioId))) {
        throw new ErrorMensaje('Solo puedes enviar mensajes a usuarios de tu mismo grupo.', 403);
      }
      const { lastID } = await db.run(
        'INSERT INTO mensajes (remitente_id, destinatario_id, contenido) VALUES (?, ?, ?)',
        [remitenteId, destinatarioId, contenido]
      );
      return lastID;
    },

    // Bandeja: un resumen por compañero de grupo (último mensaje y no leídos).
    // Incluye también conversaciones antiguas con usuarios que ya no están en el grupo,
    // porque esos mensajes siguen siendo del usuario (pero ya no podrá responder).
    conversaciones(usuarioId) {
      const yo = usuarioId;
      return db.all(
        `SELECT u.id, u.nombre, u.apellidos, u.foto, g.nombre AS grupo,
                (u.grupo_id IS NOT NULL AND u.grupo_id = (SELECT grupo_id FROM usuarios WHERE id = ?)) AS mismo_grupo,
                (SELECT m.contenido FROM mensajes m
                  WHERE (m.remitente_id = u.id AND m.destinatario_id = ?)
                     OR (m.remitente_id = ? AND m.destinatario_id = u.id)
                  ORDER BY m.fecha DESC, m.id DESC LIMIT 1) AS ultimo_mensaje,
                (SELECT m.fecha FROM mensajes m
                  WHERE (m.remitente_id = u.id AND m.destinatario_id = ?)
                     OR (m.remitente_id = ? AND m.destinatario_id = u.id)
                  ORDER BY m.fecha DESC, m.id DESC LIMIT 1) AS fecha_ultimo,
                (SELECT COUNT(*) FROM mensajes m
                  WHERE m.remitente_id = u.id AND m.destinatario_id = ? AND m.leido = 0) AS no_leidos
           FROM usuarios u
           LEFT JOIN grupos g ON g.id = u.grupo_id
          WHERE u.id <> ?
            AND (
                  (u.grupo_id IS NOT NULL AND u.grupo_id = (SELECT grupo_id FROM usuarios WHERE id = ?))
               OR EXISTS (SELECT 1 FROM mensajes m
                           WHERE (m.remitente_id = u.id AND m.destinatario_id = ?)
                              OR (m.remitente_id = ? AND m.destinatario_id = u.id))
                )
          ORDER BY fecha_ultimo IS NULL, fecha_ultimo DESC, u.nombre`,
        [yo, yo, yo, yo, yo, yo, yo, yo, yo, yo]
      );
    },

    // Historial entre el usuario de la sesión y otro usuario.
    // La condición WHERE garantiza que solo salen mensajes en los que participa "usuarioId".
    async historial(usuarioId, otroId) {
      const otro = await usuarios.buscarPorId(otroId);
      if (!otro || otro.id === usuarioId) throw new ErrorMensaje('Usuario no encontrado.', 404);

      const mensajes = await db.all(
        `SELECT m.id, m.remitente_id, m.destinatario_id, m.contenido, m.fecha, m.leido,
                (m.remitente_id = ?) AS enviado_por_mi
           FROM mensajes m
          WHERE (m.remitente_id = ? AND m.destinatario_id = ?)
             OR (m.remitente_id = ? AND m.destinatario_id = ?)
          ORDER BY m.fecha, m.id`,
        [usuarioId, usuarioId, otroId, otroId, usuarioId]
      );
      const puedeEscribir = await usuarios.mismoGrupo(usuarioId, otroId);

      // Sin mensajes previos y sin grupo en común no hay nada que ver: no revelamos nada
      if (!puedeEscribir && mensajes.length === 0) {
        throw new ErrorMensaje('Solo puedes ver conversaciones con usuarios de tu grupo.', 403);
      }
      return { otro, mensajes, puedeEscribir };
    },

    // Marca como leídos los mensajes que "otroId" ha enviado a "usuarioId"
    marcarLeidos(usuarioId, otroId) {
      return db.run(
        'UPDATE mensajes SET leido = 1 WHERE destinatario_id = ? AND remitente_id = ? AND leido = 0',
        [usuarioId, otroId]
      );
    },

    async totalNoLeidos(usuarioId) {
      const fila = await db.get(
        'SELECT COUNT(*) AS total FROM mensajes WHERE destinatario_id = ? AND leido = 0',
        [usuarioId]
      );
      return fila ? fila.total : 0;
    },
  };
};

module.exports.ErrorMensaje = ErrorMensaje;
module.exports.MAX_LONGITUD = MAX_LONGITUD;
