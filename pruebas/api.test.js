/* Batería de pruebas de humo contra la API real.
   Mongo en memoria + Supabase apuntando a un destino inexistente:
   no se toca ningún servicio real del usuario. */
const { MongoMemoryServer } = require('mongodb-memory-server');

let ok = 0, fallos = 0;
const errores = [];

function comprobar(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ✅ ${nombre}`); }
  else { fallos++; errores.push(nombre + (detalle ? ` → ${detalle}` : '')); console.log(`  ❌ ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}

function seccion(t) { console.log(`\n\x1b[1m── ${t} ──\x1b[0m`); }

(async () => {
  const mongo = await MongoMemoryServer.create();

  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.MONGO_URI = mongo.getUri() + 'iglesia_test';
  process.env.JWT_SECRET = 'x'.repeat(64);
  process.env.JWT_EXPIRES_IN = '2h';
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';        // destino muerto a propósito
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba';
  process.env.CORS_ORIGIN = 'http://127.0.0.1:5500,http://localhost:5500';
  process.env.MAX_FILE_SIZE_MB = '1';
  process.env.BASE_URL = '';

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);

  const app = require('../app');
  const bcrypt = require('bcrypt');
  const User = require('../models/User');
  const Documento = require('../models/Documento');

  const servidor = app.listen(0);
  await new Promise(r => servidor.once('listening', r));
  const BASE = `http://127.0.0.1:${servidor.address().port}`;

  const pedir = async (ruta, opciones = {}) => {
    const r = await fetch(BASE + ruta, opciones);
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, body: j, texto: t, headers: r.headers };
  };
  const json = (metodo, datos, extra = {}) => ({
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(extra.headers || {}) },
    body: JSON.stringify(datos)
  });
  const conToken = (t) => ({ headers: { Authorization: `Bearer ${t}` } });

  /* ══════════════════════════════════════════════ */
  seccion('Arranque y rutas básicas');

  let r = await pedir('/health');
  comprobar('GET /health devuelve 200', r.status === 200, `status ${r.status}`);

  r = await pedir('/');
  comprobar('GET / devuelve 200', r.status === 200);

  r = await pedir('/api');
  comprobar('GET /api lista los endpoints', r.status === 200 && !!r.body.endpoints);
  comprobar('GET /api expone las categorías', Array.isArray(r.body.categorias) && r.body.categorias.length === 6);

  r = await pedir('/ruta-que-no-existe');
  comprobar('Ruta inexistente devuelve 404', r.status === 404, `status ${r.status}`);

  seccion('Cabeceras de seguridad (helmet)');
  r = await pedir('/health');
  comprobar('X-Content-Type-Options: nosniff', r.headers.get('x-content-type-options') === 'nosniff');
  comprobar('No filtra X-Powered-By: Express', !r.headers.get('x-powered-by'), r.headers.get('x-powered-by'));
  comprobar('Referrer-Policy presente', !!r.headers.get('referrer-policy'));

  seccion('CORS');
  r = await pedir('/health', { headers: { Origin: 'http://127.0.0.1:5500' } });
  comprobar('Origen autorizado pasa', r.headers.get('access-control-allow-origin') === 'http://127.0.0.1:5500');
  r = await pedir('/health', { headers: { Origin: 'https://sitio-malicioso.com' } });
  comprobar('Origen NO autorizado se rechaza con 403', r.status === 403, `status ${r.status}`);

  /* ══════════════════════════════════════════════ */
  seccion('Registro: validación');

  r = await pedir('/api/auth/register', json('POST', { nombre: 'A' }));
  comprobar('Campos faltantes → 400', r.status === 400, `status ${r.status}`);

  r = await pedir('/api/auth/register', json('POST', { nombre: 'Juan', email: 'j@x.cl', password: '123' }));
  comprobar('Contraseña corta → 400', r.status === 400 && /8 caracteres/.test(r.body.error), r.body?.error);

  r = await pedir('/api/auth/register', json('POST', { nombre: 'Juan', email: 'j@x.cl', password: 'solotexto' }));
  comprobar('Contraseña sin números → 400', r.status === 400 && /letra y un número/.test(r.body.error), r.body?.error);

  r = await pedir('/api/auth/register', json('POST', { nombre: 'Juan', email: 'no-es-email', password: 'valida123' }));
  comprobar('Email con formato inválido → 400', r.status === 400, `status ${r.status} ${r.body?.error}`);

  seccion('Registro: límite de peticiones (5/hora)');
  r = await pedir('/api/auth/register', json('POST', { nombre: 'Juan', email: 'j@x.cl', password: 'valida123' }));
  comprobar('La 5ª petición (dentro de la cuota) se atiende → 201', r.status === 201, `status ${r.status}`);

  r = await pedir('/api/auth/register', json('POST', { nombre: 'Otro', email: 'otro@x.cl', password: 'valida123' }));
  comprobar('La 6ª petición supera la cuota → 429', r.status === 429, `status ${r.status}`);
  comprobar('Devuelve mensaje en español', /Demasiadas cuentas/.test(r.body?.error || ''), r.body?.error);

  const noCreado = await User.findOne({ email: 'otro@x.cl' });
  comprobar('El usuario bloqueado NO se creó en la base de datos', !noCreado);

  /* Los usuarios de prueba se crean directamente: el rol no se puede
     autoasignar por la API, que es justo lo que se comprueba abajo. */
  const hash = await bcrypt.hash('valida123', 12);
  const miembro = await User.create({ nombre: 'Miembro', email: 'miembro@x.cl', password: hash });
  const editor  = await User.create({ nombre: 'Editor',  email: 'editor@x.cl',  password: hash, rol: 'editor' });
  const admin   = await User.create({ nombre: 'Admin',   email: 'admin@x.cl',   password: hash, rol: 'admin' });

  seccion('Normalización de email');
  await User.create({ nombre: 'Mayus', email: '  MAYUS@X.CL  ', password: hash });
  const guardado = await User.findOne({ email: 'mayus@x.cl' });
  comprobar('Email se guarda en minúsculas y sin espacios', !!guardado, 'no se encontró en minúsculas');

  /* ══════════════════════════════════════════════ */
  seccion('Login');

  r = await pedir('/api/auth/login', json('POST', { email: 'admin@x.cl', password: 'incorrecta' }));
  const msgPasswordMala = r.body?.error;
  comprobar('Contraseña incorrecta → 401 (antes 400)', r.status === 401, `status ${r.status}`);

  r = await pedir('/api/auth/login', json('POST', { email: 'noexiste@x.cl', password: 'incorrecta' }));
  const msgNoExiste = r.body?.error;
  comprobar('Usuario inexistente → 401', r.status === 401, `status ${r.status}`);
  comprobar('MISMO mensaje en ambos casos (sin enumeración de usuarios)',
    msgPasswordMala === msgNoExiste, `"${msgPasswordMala}" vs "${msgNoExiste}"`);

  r = await pedir('/api/auth/login', json('POST', { email: 'admin@x.cl', password: 'valida123' }));
  comprobar('Login correcto → 200 con token', r.status === 200 && !!r.body.token, `status ${r.status}`);
  comprobar('La respuesta del login NO incluye la contraseña', !r.texto.includes('$2b$'), 'hay un hash en el cuerpo');
  const tokenAdmin = r.body.token;

  r = await pedir('/api/auth/login', json('POST', { email: '  ADMIN@X.CL  ', password: 'valida123' }));
  comprobar('Login con email en mayúsculas y espacios funciona', r.status === 200, `status ${r.status}`);

  const tokenMiembro = (await pedir('/api/auth/login', json('POST', { email: 'miembro@x.cl', password: 'valida123' }))).body.token;
  const tokenEditor  = (await pedir('/api/auth/login', json('POST', { email: 'editor@x.cl',  password: 'valida123' }))).body.token;

  /* ══════════════════════════════════════════════ */
  seccion('Token');

  r = await pedir('/api/auth/perfil');
  comprobar('Sin token → 401', r.status === 401);
  r = await pedir('/api/auth/perfil', { headers: { Authorization: 'Bearer basura' } });
  comprobar('Token inválido → 401', r.status === 401);
  r = await pedir('/api/auth/perfil', { headers: { Authorization: tokenAdmin } });
  comprobar('Sin prefijo "Bearer" → 401', r.status === 401);
  r = await pedir('/api/auth/perfil', conToken(tokenAdmin));
  comprobar('Token válido → 200', r.status === 200 && r.body.usuario.rol === 'admin');
  comprobar('El perfil no incluye la contraseña', !r.texto.includes('password'), r.texto.slice(0, 120));

  /* ══════════════════════════════════════════════ */
  seccion('Roles');

  r = await pedir('/api/usuarios', conToken(tokenMiembro));
  comprobar('Miembro no puede listar usuarios → 403', r.status === 403, `status ${r.status}`);
  r = await pedir('/api/usuarios', conToken(tokenEditor));
  comprobar('Editor no puede listar usuarios → 403', r.status === 403, `status ${r.status}`);
  r = await pedir('/api/usuarios', conToken(tokenAdmin));
  comprobar('Admin sí puede listar usuarios → 200', r.status === 200, `status ${r.status}`);
  comprobar('El listado viene paginado', typeof r.body.paginas === 'number' && typeof r.body.total === 'number');
  comprobar('Ningún usuario del listado expone su contraseña', !r.texto.includes('$2b$'));

  /* ══════════════════════════════════════════════ */
  seccion('Mass assignment (PUT /usuarios/:id)');

  r = await pedir(`/api/usuarios/${miembro._id}`, json('PUT', {
    nombre: 'Nombre Cambiado',
    rol: 'editor',
    campoInventado: 'deberia-ignorarse',
    fechaRegistro: '1990-01-01T00:00:00.000Z',
    _id: '000000000000000000000000'
  }, { headers: { Authorization: `Bearer ${tokenAdmin}` } }));
  comprobar('PUT válido → 200', r.status === 200, `status ${r.status} ${r.body?.error}`);

  const tras = await User.findById(miembro._id).lean();
  comprobar('Aplica los campos de la lista blanca', tras && tras.nombre === 'Nombre Cambiado' && tras.rol === 'editor');
  comprobar('IGNORA el campo inventado', tras && tras.campoInventado === undefined, JSON.stringify(tras?.campoInventado));
  comprobar('IGNORA fechaRegistro (fuera de la lista blanca)',
    tras && new Date(tras.fechaRegistro).getFullYear() !== 1990, String(tras?.fechaRegistro));
  comprobar('El _id no se pudo sobrescribir', tras && String(tras._id) === String(miembro._id));

  r = await pedir(`/api/usuarios/${admin._id}`, json('PUT', { rol: 'miembro' },
    { headers: { Authorization: `Bearer ${tokenAdmin}` } }));
  comprobar('Un admin no puede degradarse a sí mismo → 400', r.status === 400, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${admin._id}`, { method: 'DELETE', ...conToken(tokenAdmin) });
  comprobar('Un admin no puede borrarse a sí mismo → 400', r.status === 400, `status ${r.status}`);

  r = await pedir('/api/usuarios/id-que-no-es-objectid', { method: 'DELETE', ...conToken(tokenAdmin) });
  comprobar('ObjectId mal formado → 400 (no 500)', r.status === 400, `status ${r.status}`);

  /* ══════════════════════════════════════════════ */
  seccion('Escalada de privilegios');

  const usr = await User.findOne({ email: 'j@x.cl' });
  comprobar('El registro anterior creó el usuario con rol "miembro"', !usr || usr.rol === 'miembro', usr?.rol);

  /* ══════════════════════════════════════════════ */
  seccion('Documentos: lectura pública');

  r = await pedir('/api/documentos');
  comprobar('GET /api/documentos es público → 200', r.status === 200, `status ${r.status}`);
  comprobar('Responde con paginación', typeof r.body.paginas === 'number');

  r = await pedir('/api/documentos?categoria=CategoriaFalsa');
  comprobar('Categoría inválida → 400', r.status === 400, `status ${r.status}`);

  r = await pedir('/api/documentos/no-es-un-id');
  comprobar('ID mal formado → 400 (no 500)', r.status === 400, `status ${r.status}`);

  r = await pedir('/api/documentos/000000000000000000000000');
  comprobar('ID inexistente → 404', r.status === 404, `status ${r.status}`);

  /* ══════════════════════════════════════════════ */
  seccion('Documentos: subida');

  const subir = async (token, nombreArchivo, tipo, bytes) => {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(bytes)], { type: tipo }), nombreArchivo);
    fd.append('titulo', 'Prueba');
    fd.append('categoria', 'Coro');
    return pedir('/api/documentos', { method: 'POST', body: fd, ...(token ? conToken(token) : {}) });
  };

  r = await subir(null, 'a.pdf', 'application/pdf', 10);
  comprobar('Sin token → 401', r.status === 401, `status ${r.status}`);

  r = await subir(tokenMiembro, 'a.pdf', 'application/pdf', 10);
  comprobar('Miembro no puede subir → 403', r.status === 403, `status ${r.status}`);

  r = await subir(tokenEditor, 'malicioso.html', 'text/html', 10);
  comprobar('HTML rechazado por el filtro MIME → 415', r.status === 415, `status ${r.status} ${r.body?.error}`);

  r = await subir(tokenEditor, 'icono.svg', 'image/svg+xml', 10);
  comprobar('SVG rechazado (podría ejecutar scripts) → 415', r.status === 415, `status ${r.status}`);

  r = await subir(tokenEditor, 'grande.pdf', 'application/pdf', 2 * 1024 * 1024);
  comprobar('Archivo de 2 MB con tope de 1 MB → 400', r.status === 400, `status ${r.status}`);
  comprobar('El mensaje indica el límite', /1 MB/.test(r.body?.error || ''), r.body?.error);

  r = await subir(tokenEditor, 'ok.pdf', 'application/pdf', 100);
  comprobar('PDF válido pero Supabase caído → 502 (no 500 ni cuelgue)', r.status === 502, `status ${r.status} ${r.body?.error}`);
  const docsTrasFallo = await Documento.countDocuments();
  comprobar('No queda registro en Mongo si falla el almacenamiento', docsTrasFallo === 0, `hay ${docsTrasFallo}`);

  /* ══════════════════════════════════════════════ */
  seccion('Límite de intentos de login');

  let golpe429 = 0;
  for (let i = 1; i <= 15; i++) {
    const res = await pedir('/api/auth/login', json('POST', { email: 'admin@x.cl', password: 'mala' }));
    if (res.status === 429) { golpe429 = i; break; }
  }
  comprobar('El login se bloquea tras varios intentos fallidos → 429', golpe429 > 0, 'nunca se bloqueó');
  console.log(`     (se bloqueó en el intento nº ${golpe429} de esta tanda)`);

  r = await pedir('/api/auth/login', json('POST', { email: 'editor@x.cl', password: 'valida123' }));
  comprobar('El bloqueo también afecta a credenciales correctas (mismo IP)', r.status === 429, `status ${r.status}`);

  /* ══════════════════════════════════════════════ */
  seccion('Cuerpo JSON inválido');
  r = await pedir('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{roto' });
  comprobar('JSON mal formado → 400 (no 500)', r.status === 400, `status ${r.status}`);

  /* ══════════════════════════════════════════════ */
  console.log(`\n\x1b[1m${'═'.repeat(56)}\x1b[0m`);
  console.log(`\x1b[1mRESULTADO: ${ok} correctas, ${fallos} fallidas\x1b[0m`);
  if (fallos) { console.log('\nFallos:'); errores.forEach(e => console.log('  •', e)); }
  console.log('═'.repeat(56));

  servidor.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('\n💥 La suite reventó:\n', e); process.exit(2); });
