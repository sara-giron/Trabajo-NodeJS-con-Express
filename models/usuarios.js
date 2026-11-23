// Consultas de usuarios necesarias para el listado y los grupos.
// Se construye recibiendo la conexión (db) para poder probarlo con otra BD en los tests.
// NUNCA se devuelve password_hash fuera de este módulo.

const CAMPOS_PUBLICOS = `u.id, u.usuario, u.nombre, u.apellidos, u.email, u.foto, u.rol,
                         u.grupo_id, g.nombre AS grupo`;

module.exports = function crearModeloUsuarios(db) {
  return {
    // Listado general de usuarios con el nombre de su grupo
    listarTodos() {
      return db.all(
        `SELECT ${CAMPOS_PUBLICOS}
           FROM usuarios u
           LEFT JOIN grupos g ON g.id = u.grupo_id
          ORDER BY g.nombre IS NULL, g.nombre, u.nombre, u.apellidos`
      );
    },

    buscarPorId(id) {
      return db.get(
        `SELECT ${CAMPOS_PUBLICOS}
           FROM usuarios u
           LEFT JOIN grupos g ON g.id = u.grupo_id
          WHERE u.id = ?`,
        [id]
      );
    },

    // Usuarios del mismo grupo que "usuarioId" (sin incluirle a él).
    // El grupo se lee SIEMPRE de la BD, no de la sesión, por si el admin lo ha cambiado.
    companerosDeGrupo(usuarioId) {
      return db.all(
        `SELECT ${CAMPOS_PUBLICOS}
           FROM usuarios yo
           JOIN usuarios u ON u.grupo_id = yo.grupo_id AND u.id <> yo.id
           JOIN grupos g   ON g.id = u.grupo_id
          WHERE yo.id = ?
          ORDER BY u.nombre, u.apellidos`,
        [usuarioId]
      );
    },

    // true si ambos usuarios existen y comparten grupo (un usuario sin grupo no comparte con nadie)
    async mismoGrupo(idA, idB) {
      const fila = await db.get(
        `SELECT 1 AS ok
           FROM usuarios a
           JOIN usuarios b ON b.grupo_id = a.grupo_id
          WHERE a.id = ? AND b.id = ? AND a.id <> b.id AND a.grupo_id IS NOT NULL`,
        [idA, idB]
      );
      return Boolean(fila);
    },
  };
};
