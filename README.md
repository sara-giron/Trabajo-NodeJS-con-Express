# Gestión de usuarios, grupos y mensajes

Aplicación NodeJS + Express + Pug + SQLite. Los usuarios se identifican con sesión
(`express-session`) y solo pueden enviarse mensajes con usuarios de su mismo grupo.

## Puesta en marcha

```bash
npm install
npm run seed      # crea db/app.db con datos de prueba (contraseña de todos: 1234)
npm run dev       # http://localhost:3000
npm test          # pruebas de la lógica de mensajes y seguridad (Node >= 22.5)
```

Usuarios de prueba: `admin` (sin grupo), `ana`, `luis`, `marta` (grupo Desarrollo),
`pablo`, `sara` (grupo Sistemas).

## Base de datos (3 tablas) — `db/schema.sql`

| Tabla      | Campos principales |
|------------|--------------------|
| `grupos`   | id, nombre, descripcion |
| `usuarios` | id, usuario, password_hash, nombre, apellidos, email, foto, rol (`admin`/`usuario`), grupo_id |
| `mensajes` | id, remitente_id, destinatario_id, contenido, fecha, leido |

Un usuario pertenece a **un único grupo** (`usuarios.grupo_id`). Al borrar un grupo, sus
usuarios quedan sin grupo; al borrar un usuario, se borran sus mensajes.

## Estructura

```
app.js                    configuración de Express, sesión, CSRF y rutas
db/schema.sql             tablas
db/conexion.js            conexión sqlite3 con promesas (all/get/run/exec)
db/init.js                crea tablas y datos de prueba
middleware/seguridad.js   requiereLogin, requiereAdmin, csrf, idValido
models/usuarios.js        listado, compañeros de grupo, mismoGrupo
models/mensajes.js        enviar, conversaciones, historial, marcarLeidos
routes/usuarios.js        GET /usuarios, GET /usuarios/grupo
routes/mensajes.js        GET /mensajes, GET /mensajes/:id, POST /mensajes/:id
views/                    plantillas Pug
tests/                    pruebas con node:test
```

## Parte: usuarios y mensajes

| Requisito | Dónde |
|-----------|-------|
| Listado de usuarios | `GET /usuarios` |
| Usuarios del mismo grupo | `GET /usuarios/grupo` |
| Envío de mensajes | `POST /mensajes/:idDestinatario` |
| Almacenamiento | tabla `mensajes` |
| Historial | `GET /mensajes` (bandeja) y `GET /mensajes/:idUsuario` (conversación) |
| Seguridad | ver abajo |

### Seguridad: nadie puede leer mensajes de otros

- **El remitente sale de la sesión**, nunca del formulario: no se puede enviar en nombre de otro.
- **No existe ninguna ruta que lea un mensaje por su id.** El historial se pide por
  "usuario con el que hablo" y la consulta siempre filtra por el usuario de la sesión
  (`remitente = yo AND destinatario = otro` o al revés). Cambiar el id en la URL solo
  devuelve *tu* conversación con esa persona, nunca la de terceros.
- **Mismo grupo comprobado en el servidor** en cada envío, leyendo el grupo de la BD
  (no de la sesión, por si el administrador lo ha cambiado). Las vistas ocultan botones,
  pero la seguridad no depende de ellas.
- El administrador gestiona usuarios y grupos, pero **no puede leer mensajes**.
- Consultas parametrizadas (`?`) contra inyección SQL.
- Pug escapa el contenido (`=` / `#{}`), así que un mensaje con HTML no se ejecuta (XSS).
- Token **CSRF** en todos los formularios POST y cookie de sesión `httpOnly` + `sameSite`.
- Longitud máxima del mensaje (1000) validada en código y en la propia tabla.

## Integración con el resto del grupo

> El login todavía **no está** en esta rama: hasta que se añada, `/login` da 404 y
> no se puede entrar en la web (las pruebas, `npm test`, sí funcionan).

**Login** — rutas `GET /login`, `POST /login` y `POST /logout` (el menú ya tiene el
botón "Salir"); registrarlas en `app.js`, donde está comentado. Al iniciar sesión hay
que guardar exactamente:

```js
req.session.usuario = { id, nombre, rol };   // rol: 'admin' | 'usuario'
```

Recomendado: comprobar la contraseña con `bcrypt.compareSync` y llamar a
`req.session.regenerate()` antes de guardar el usuario (evita la fijación de sesión).

**Altas/bajas (admin)** — usar `requiereLogin, requiereAdmin` de `middleware/seguridad.js`,
guardar la foto en `public/uploads/` y su nombre de fichero en `usuarios.foto`, y la
contraseña con `bcrypt.hashSync(pass, 10)` en `password_hash`.

**Formularios POST** — todos deben incluir el token CSRF:

```pug
input(type="hidden" name="_csrf" value=csrf)
```

Para formularios con foto (`multipart/form-data`, multer) el token se puede enviar
en la query (`action="/admin/usuarios?_csrf=" + csrf`) o en la cabecera `x-csrf-token`;
en ese caso, añadir `req.query._csrf` a la comprobación de `middleware/seguridad.js`.
