-- Esquema común del proyecto (acordarlo con el resto del grupo)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS grupos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL UNIQUE,
  descripcion TEXT
);

-- Un usuario pertenece como máximo a UN grupo (columna grupo_id única por fila)
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  apellidos     TEXT,
  email         TEXT UNIQUE,
  foto          TEXT,
  rol           TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario')),
  grupo_id      INTEGER REFERENCES grupos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mensajes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  remitente_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  destinatario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  contenido       TEXT NOT NULL CHECK (length(contenido) BETWEEN 1 AND 1000),
  fecha           TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  leido           INTEGER NOT NULL DEFAULT 0 CHECK (leido IN (0, 1)),
  CHECK (remitente_id <> destinatario_id)
);

CREATE INDEX IF NOT EXISTS idx_mensajes_remitente    ON mensajes(remitente_id, destinatario_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_destinatario ON mensajes(destinatario_id, leido);
CREATE INDEX IF NOT EXISTS idx_usuarios_grupo        ON usuarios(grupo_id);
