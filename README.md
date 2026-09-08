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

| Rol | Calendario, avisos y textos de la portada | Documentos | Usuarios y aprobaciones |
|---|---|---|---|
| sin sesión | leer | nada: ve el aviso de acceso | — |
| `miembro` | leer | ver y descargar | — |
| `editor` | crear, editar y borrar | ver, descargar, subir, editar y borrar | — |
| `admin` | lo mismo que `editor` | lo mismo que `editor` | acceso completo |

`miembro` es el rol por defecto al registrarse. Lo único que separa a un
`admin` de un `editor` es la gestión de cuentas y la aprobación de registros:
sobre los documentos, las actividades y los avisos tienen exactamente los
mismos permisos.

El calendario y los avisos son lo único que se lee sin cuenta. Son
información que la iglesia publica hacia fuera: cuándo se reúne cada rama y
qué anuncia. Los documentos, en cambio, son material interno.

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
| `GET` | `/api/documentos?categoria=Coro&pagina=1&limite=20` | con sesión |
| `GET` | `/api/documentos/:id` | con sesión |
| `GET` | `/api/documentos/:id/descargar` | público (ver abajo) |
| `POST` | `/api/documentos` | editor/admin |
| `PUT` | `/api/documentos/:id` | editor/admin |
| `DELETE` | `/api/documentos/:id` | editor/admin |

Categorías válidas: `Varones`, `Dorcas`, `Jovenes`, `Coro`, `EBD`, `General`.

**Leer el catálogo exige sesión.** Sirve cualquier cuenta aprobada, sin
importar el rol: el requisito es estar dentro, no ser editor. En el frontend,
`js/acceso.js` detecta la falta de sesión en `documentos.html` y en las cinco
páginas de rama, y deja la zona en gris con un aviso y un enlace a
`login.html?volver=<página>` en vez de pedir a la API un listado que va a
responder `401`.

La descarga (`/:id/descargar`) se queda sin token a propósito. Es un enlace
`<a href>` normal, que no puede enviar la cabecera `Authorization`, y lo único
que hace es redirigir a la URL de Supabase. Como el bucket es público, esa URL
ya funciona por sí sola: exigir token ahí rompería las descargas sin proteger
nada. Lo que sí impide el `401` del listado es *descubrir* esas URLs. Si en
algún momento hace falta que los archivos también sean privados, hay que pasar
el bucket a privado y firmar URLs temporales, no tocar esta ruta.

### Actividades del calendario

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/actividades?categoria=Coro&desde=2026-09-01&hasta=2026-09-30` | público |
| `POST` | `/api/actividades` | editor/admin |
| `PUT` | `/api/actividades/:id` | editor/admin |
| `DELETE` | `/api/actividades/:id` | editor/admin |

Campos: `titulo` y `fecha` obligatorios; `descripcion`, `hora` (`HH:MM`) y
`lugar` opcionales. `desde` y `hasta` van en `YYYY-MM-DD`; la agenda del
frontend pide siempre el mes que se está mirando, y las muestra en el orden
que devuelve la API: por fecha y hora ascendente, de lo más cercano a lo más
lejano.

**La fecha es un día, no un instante.** Se guarda y se compara en UTC, y el
frontend la lee con `.slice(0, 10)`. Si se guardara en hora local, una
actividad del día 1 aparecería el día 31 del mes anterior para quien mira
desde Chile. Por eso ni el servidor ni el cliente convierten husos: tratan el
campo como lo que es, una casilla del calendario.

### Avisos

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/avisos?categoria=Coro` | público |
| `POST` | `/api/avisos` | editor/admin |
| `PUT` | `/api/avisos/:id` | editor/admin |
| `DELETE` | `/api/avisos/:id` | editor/admin |

Campos: `titulo` y `cuerpo` obligatorios, `fijado` opcional. Los avisos
fijados salen primero; el resto, del más nuevo al más viejo.

### Textos de la portada

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/contenido` | público |
| `PUT` | `/api/contenido/:clave` | editor/admin |

Trozos de texto que un editor cambia desde el navegador sin tocar el HTML.
Las claves están declaradas en `config/contenido.js`, junto con su etiqueta,
su largo máximo y su **texto por defecto**. Hoy hay dos: `versiculo_texto` y `versiculo_referencia`.

`GET` devuelve siempre todas las claves. Las que nadie ha editado salen con su
valor por defecto, así que la portada nunca aparece vacía, ni con la base
recién creada. `PUT` hace *upsert*: la fila se crea la primera vez que alguien
edita esa clave.

Para añadir un texto editable basta con declararlo en `config/contenido.js` y
poner `data-contenido="<clave>"` en el elemento del HTML.

```bash
curl -X POST http://localhost:3000/api/documentos \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@partitura.pdf" \
  -F "titulo=En nombre de Jesús" \
  -F "categoria=Coro"
```

## Despliegue

El backend necesita un servicio que ejecute Node (Render, Railway, Fly). El
frontend es HTML estático: sirve cualquier hosting, incluido Netlify o Cloudflare
Pages. Van en sitios distintos y se hablan por HTTPS.

**1. Backend.** En Render: *New > Blueprint* y apuntar a este repositorio.
`render.yaml` ya trae el build, el arranque, el health check y la lista de
variables; solo hay que rellenar sus valores en el panel. El puerto lo pone el
proveedor: `config/env.js` ya lee `process.env.PORT`.

El plan `free` del blueprint **duerme el servidor tras ~15 minutos sin visitas**
y la siguiente tarda entre 30 y 60 segundos en responder. Para uso real hay que
subir de plan; para enseñar el sitio, basta con abrirlo unos minutos antes.

**2. Variables de entorno** en el panel del proveedor (nunca en el repositorio):

```
NODE_ENV=production
MONGO_URI=...            # la misma cadena que en local
JWT_SECRET=...           # 64 caracteres, distinto al de desarrollo
BASE_URL=https://api.tudominio.cl
CORS_ORIGIN=https://tudominio.cl,https://www.tudominio.cl
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=archivos
MAX_FILE_SIZE_MB=10
```

`CORS_ORIGIN` es la parte que más se equivoca: van los orígenes del **frontend**,
con `https://` y sin barra final. Si no coincide, el navegador bloquea todas las
peticiones y la página parece caída sin dar error visible.

**3. MongoDB Atlas** → *Network Access*: la IP de salida del proveedor, o
`0.0.0.0/0` si es dinámica.

**4. Frontend.** Subir `iglesia-web-frontend` tal cual y, en `js/config.js`,
cambiar `PRODUCCION` por la URL real del backend. El archivo elige sola la API
según el dominio, así que no hay que tocar nada más al alternar local/producción;
si se olvida, la consola avisa con un error explícito.

**5. Rutas del hosting estático**: que `404.html` se sirva como página de error.
En Netlify basta con que el archivo exista.

**6. Comprobar**, en este orden: `GET /health` responde, la portada carga, el
login funciona, y un documento se sube y se descarga.

### Antes de publicar

- [ ] `og:image` con URL absoluta en las 7 páginas (hoy es relativa: no sale
      imagen al compartir por WhatsApp)
- [ ] Teléfono, correo y redes reales en `components/footer.html`
- [ ] `robots.txt` y `sitemap.xml` con el dominio definitivo
- [ ] Copias de seguridad de Mongo: el plan M0 no hace ninguna

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
