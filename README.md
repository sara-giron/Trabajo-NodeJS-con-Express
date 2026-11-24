# Gestión de usuarios, grupos y mensajes

Aplicación NodeJS + Express + Pug + SQLite. Los usuarios entran con usuario y contraseña
(`express-session` + `bcryptjs`), el administrador gestiona usuarios y grupos, y los
usuarios solo pueden enviarse mensajes con los de su mismo grupo.

Grupo: Sara (login, usuarios y permisos), David (grupos) y Jaime (listado y mensajes).

## Puesta en marcha

```bash
npm install
npm run seed      # crea db/app.db con datos de prueba (contraseña de todos: 1234)
npm run dev       # http://localhost:3000
npm test          # pruebas de la lógica de mensajes y seguridad (Node >= 22.5)
```

Usuarios de prueba: `admin` (administrador, sin grupo), `ana`, `luis`, `marta`
(grupo Desarrollo), `pablo`, `sara` (grupo Sistemas).

Para probar las rutas con REST Client: `requests.http` (mensajes), `usuarios.http`
(login y admin) y `grupos.http` (grupos).

## Base de datos (3 tablas) — `db/schema.sql`

| Tabla      | Campos principales |
|------------|--------------------|
| `grupos`   | id, nombre, descripcion |
| `usuarios` | id, usuario, password_hash, nombre, apellidos, email, foto, rol (`admin`/`usuario`), grupo_id |
| `mensajes` | id, remitente_id, destinatario_id, contenido, fecha, leido |

Un usuario pertenece a **un único grupo** (`usuarios.grupo_id`). Al borrar un grupo, sus
usuarios quedan sin grupo; al borrar un usuario, se borran sus mensajes y su foto.

## Estructura

```
app.js                    configuración de Express, sesión, CSRF y rutas
db/schema.sql             tablas
db/conexion.js            conexión sqlite3 con promesas (all/get/run/exec)
db/init.js                crea tablas y datos de prueba
middleware/seguridad.js   requiereLogin, requiereAdmin, csrf, idValido
models/usuarios.js        listado, compañeros de grupo, mismoGrupo
models/mensajes.js        enviar, conversaciones, historial, marcarLeidos
routes/login.js           GET /login, POST /login, POST /logout
routes/admin.js           alta y baja de usuarios con foto (solo admin)
routes/grupos.js          alta, baja, listado y asignación de grupos (solo admin)
routes/usuarios.js        GET /usuarios, GET /usuarios/grupo
routes/mensajes.js        GET /mensajes, GET /mensajes/:id, POST /mensajes/:id
views/                    plantillas Pug (layout.pug + block content)
public/uploads/           fotos de los usuarios (no se suben a git)
tests/                    pruebas con node:test
```

## Parte 1: login, usuarios y permisos (Sara)

| Requisito | Dónde |
|-----------|-------|
| Login y cierre de sesión | `GET /login`, `POST /login`, `POST /logout` |
| Comprobar usuario y contraseña | `bcrypt.compare` con el hash de la BD |
| Alta de usuarios con datos personales y foto | `GET /admin/usuarios/nuevo`, `POST /admin/usuarios` |
| Baja de usuarios | `POST /admin/usuarios/:id/borrar` |
| Permisos de administrador | `requiereLogin` + `requiereAdmin` en todas las rutas de `/admin` |

- Al entrar se crea una sesión nueva (`req.session.regenerate`) y se guarda
  `req.session.usuario = { id, nombre, rol }`.
- Si falla el login, el mensaje es el mismo para usuario y contraseña, para no dar pistas.
- La foto se sube con multer: solo JPG, PNG o WEBP, máximo 2 MB y con un nombre
  aleatorio. Como el formulario es `multipart/form-data`, el token CSRF va en la URL
  (`?_csrf=`).
- El administrador no puede darse de baja a sí mismo.

## Parte 2: grupos (David)

| Requisito | Dónde |
|-----------|-------|
| Listado y alta de grupos | `GET /grupos`, `POST /grupos` |
| Baja de grupos | `POST /grupos/:id/borrar` |
| Ver un grupo y sus usuarios | `GET /grupos/:id` |
| Asignar o quitar usuarios | `POST /grupos/:id/asignar`, `POST /grupos/:id/quitar` |

Todas las rutas son solo para el administrador. No puede haber dos grupos con el mismo nombre.

## Parte 3: usuarios y mensajes (Jaime)

| Requisito | Dónde |
|-----------|-------|
| Listado de usuarios | `GET /usuarios` |
| Usuarios del mismo grupo | `GET /usuarios/grupo` |
| Envío de mensajes | `POST /mensajes/:idDestinatario` |
| Almacenamiento | tabla `mensajes` |
| Historial | `GET /mensajes` (bandeja) y `GET /mensajes/:idUsuario` (conversación) |

### Nadie puede leer mensajes de otros

- **El remitente sale de la sesión**, nunca del formulario: no se puede enviar en nombre de otro.
- **No existe ninguna ruta que lea un mensaje por su id.** El historial se pide por
  "usuario con el que hablo" y la consulta siempre filtra por el usuario de la sesión
  (`remitente = yo AND destinatario = otro` o al revés). Cambiar el id en la URL solo
  devuelve *tu* conversación con esa persona, nunca la de terceros.
- **Mismo grupo comprobado en el servidor** en cada envío, leyendo el grupo de la BD
  (no de la sesión, por si el administrador lo ha cambiado).
- El administrador gestiona usuarios y grupos, pero **no puede leer mensajes**.
- Longitud máxima del mensaje (1000) validada en código y en la propia tabla.

## Seguridad común

- Contraseñas guardadas con `bcrypt`, nunca en claro.
- Consultas parametrizadas (`?`) contra inyección SQL.
- Pug escapa el contenido (`=` / `#{}`), así que un texto con HTML no se ejecuta (XSS).
- Token **CSRF** en todos los formularios POST y cookie de sesión `httpOnly` + `sameSite`.
- Los ids de la URL se validan con `idValido` y los errores no enseñan detalles internos.
