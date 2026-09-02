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

| Rol | Puede |
|---|---|
| `miembro` | Ver y descargar documentos (por defecto al registrarse) |
| `editor` | Además: subir y editar documentos |
| `admin` | Todo, más gestionar usuarios y borrar documentos |

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
| `GET` | `/api/usuarios?pagina=1&limite=50` | admin |
| `PUT` | `/api/usuarios/:id` | admin |
| `DELETE` | `/api/usuarios/:id` | admin |

`PUT` solo acepta `nombre`, `email`, `rol` y `password`.

### Documentos

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/documentos?categoria=Coro&pagina=1&limite=20` | público |
| `GET` | `/api/documentos/:id` | público |
| `GET` | `/api/documentos/:id/descargar` | público |
| `POST` | `/api/documentos` | editor/admin |
| `PUT` | `/api/documentos/:id` | editor/admin |
| `DELETE` | `/api/documentos/:id` | admin |

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
