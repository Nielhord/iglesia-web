# iglesia-web-backend

API REST de la Iglesia Evangélica de Dios Pentecostal (IEDP Talca). Gestiona
usuarios con roles y los documentos que cada rama comparte con la congregación.

- **Node + Express 5** — servidor HTTP
- **MongoDB Atlas + Mongoose** — usuarios y metadatos de documentos
- **Supabase Storage** — archivos (PDF, imágenes, Office, audio)
- **JWT + bcrypt** — autenticación con tres roles

## Estructura

```
config/       env (validación), conexión a Mongo, cliente de Supabase
middleware/   auth (JWT), role, multer (límites), rate limit, errores
models/       User, Documento
controllers/  lógica de cada recurso
routes/       definición de endpoints
app.js        construcción de la app Express
server.js     arranque, conexión a BD y cierre ordenado
```

## Puesta en marcha

```bash
npm install
cp .env.example .env      # y completa los valores
npm run dev               # nodemon
```

Genera el `JWT_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|:--:|---|
| `PORT` | | Puerto del servidor (3000 por defecto) |
| `NODE_ENV` | | `development` o `production` |
| `BASE_URL` | | URL pública del backend, usada en los enlaces de descarga |
| `CORS_ORIGIN` | | Orígenes permitidos, separados por coma |
| `JWT_SECRET` | ✅ | Mínimo 32 caracteres aleatorios |
| `JWT_EXPIRES_IN` | | Duración del token (`2h` por defecto) |
| `MONGO_URI` | ✅ | Cadena de conexión de Atlas |
| `SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Clave secreta. **Solo servidor** |
| `SUPABASE_BUCKET` | | Bucket de archivos (`archivos` por defecto) |
| `MAX_FILE_SIZE_MB` | | Tamaño máximo por archivo (10 por defecto) |

El servidor no arranca si falta alguna obligatoria.

## Roles

| Rol | Documentos | Usuarios y aprobaciones |
|---|---|---|
| `miembro` | ver y descargar | — |
| `editor` | ver, descargar, subir, editar y borrar | — |
| `admin` | lo mismo que `editor` | acceso completo |

`miembro` es el rol por defecto al registrarse. Lo único que separa a un
`admin` de un `editor` es la gestión de cuentas y la aprobación de registros:
sobre los documentos tienen exactamente los mismos permisos.

## Aprobación de registros

Una cuenta recién creada queda en estado `pendiente` y **no puede iniciar
sesión**: el login responde `403` con un mensaje explicativo. Un admin la
resuelve desde `aprobaciones.html`, que consume los endpoints `/aprobar` y
`/rechazar`. Queda registrado quién la revisó (`revisadoPor`) y cuándo
(`fechaRevision`).

Estados posibles: `pendiente` → `aprobado` o `rechazado`. Un rechazo es
reversible: basta volver a aprobar.

Detalles que conviene tener presentes:

- **Cuentas anteriores a esta función.** No tienen el campo `estado` guardado.
  El login las lee con `.lean()` precisamente para no aplicarles el valor por
  defecto del schema, así que siguen entrando con normalidad. Ejecuta
  `npm run migrar-estados` una vez para dejar el dato explícito.
- **Un admin no puede cambiar su propio estado.** Si fuera el único, nadie
  podría revertirlo.
- **El token sobrevive al rechazo.** Quien ya tenía sesión abierta conserva el
  acceso hasta que su token caduca (`JWT_EXPIRES_IN`, 2 h por defecto), porque
  el estado se comprueba al iniciar sesión y no en cada petición. Para cortar
  el acceso al instante, elimina la cuenta.

El rol nunca se acepta desde el registro: solo un admin puede cambiarlo.

## Endpoints

Todos bajo el prefijo `/api`.

### Autenticación

| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `/api/auth/register` | público |
| `POST` | `/api/auth/login` | público |
| `GET` | `/api/auth/perfil` | token |

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@iedp.cl","password":"tuclave123"}'
```

### Usuarios

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/usuarios?pagina=1&limite=50&estado=pendiente` | admin |
| `PUT` | `/api/usuarios/:id` | admin |
| `PUT` | `/api/usuarios/:id/aprobar` | admin |
| `PUT` | `/api/usuarios/:id/rechazar` | admin |
| `DELETE` | `/api/usuarios/:id` | admin |

El filtro `estado` acepta `pendiente`, `aprobado` o `rechazado`.

`PUT /api/usuarios/:id` acepta `nombre`, `email`, `rol` y `password`, y aplica
solo los que vengan en el cuerpo. Cualquier otro campo se ignora, `estado`
incluido: ese se cambia únicamente por `/aprobar` y `/rechazar`. La contraseña
se guarda hasheada con bcrypt y pasa la misma validación que en el registro.

La escritura usa `$set` sobre el documento sin hidratarlo. No es un detalle de
estilo: con `findById()` + `save()`, Mongoose aplicaba el default `pendiente`
a las cuentas que no tienen el campo `estado` y lo grababa, de modo que
cambiarle el nombre a una cuenta antigua la dejaba sin poder iniciar sesión.

`PUT` solo acepta `nombre`, `email`, `rol` y `password`.

### Documentos

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/documentos?categoria=Coro&pagina=1&limite=20` | público |
| `GET` | `/api/documentos/:id` | público |
| `GET` | `/api/documentos/:id/descargar` | público |
| `POST` | `/api/documentos` | editor/admin |
| `PUT` | `/api/documentos/:id` | editor/admin |
| `DELETE` | `/api/documentos/:id` | editor/admin |

Categorías válidas: `Varones`, `Dorcas`, `Jovenes`, `Coro`, `EBD`, `General`.

```bash
curl -X POST http://localhost:3000/api/documentos \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@partitura.pdf" \
  -F "titulo=En nombre de Jesús" \
  -F "categoria=Coro"
```

## Notas de seguridad

- El `.env` está en `.gitignore`. **Nunca** lo subas al repositorio.
- La `SUPABASE_SERVICE_ROLE_KEY` se salta las políticas RLS: si se filtra,
  hay que revocarla en Supabase inmediatamente.
- Rotar el `JWT_SECRET` invalida todas las sesiones activas.
- Los límites de peticiones son por IP: 8 intentos de login cada 15 min,
  5 registros por hora, 30 subidas por hora.
- Solo se aceptan los tipos MIME de `middleware/multer.js`. HTML y SVG están
  excluidos a propósito: al servirse desde una URL pública podrían ejecutar
  scripts.

## Pendiente

- Tests (no hay ninguno todavía)
- Recuperación de contraseña por correo
- Refresh tokens
