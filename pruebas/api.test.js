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
  // estado: 'aprobado' explícito. El default del schema es 'pendiente', y sin
  // esto ninguno de estos usuarios podría iniciar sesión.
  const aprobado = { password: hash, estado: 'aprobado' };
  const miembro = await User.create({ nombre: 'Miembro', email: 'miembro@x.cl', ...aprobado });
  const editor  = await User.create({ nombre: 'Editor',  email: 'editor@x.cl',  ...aprobado, rol: 'editor' });
  const admin   = await User.create({ nombre: 'Admin',   email: 'admin@x.cl',   ...aprobado, rol: 'admin' });

  seccion('Normalización de email');
  await User.create({ nombre: 'Mayus', email: '  MAYUS@X.CL  ', ...aprobado });
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
  seccion('Aprobación de registros');

  // El registro del bloque anterior (j@x.cl) quedó pendiente.
  const reciennacido = await User.findOne({ email: 'j@x.cl' }).lean();
  comprobar('Una cuenta recién registrada queda en "pendiente"',
    reciennacido?.estado === 'pendiente', String(reciennacido?.estado));

  r = await pedir('/api/auth/register', json('POST',
    { nombre: 'Nuevo', email: 'nuevo@x.cl', password: 'valida123' }));
  // La cuota de registro (5/hora) ya está agotada, así que este usuario se
  // crea directamente para poder probar el ciclo completo.
  const enEspera = await User.create({
    nombre: 'En Espera', email: 'espera@x.cl', password: hash
  });
  comprobar('El default del schema es "pendiente"', enEspera.estado === 'pendiente', enEspera.estado);

  r = await pedir('/api/auth/login', json('POST', { email: 'espera@x.cl', password: 'valida123' }));
  comprobar('Login de cuenta pendiente → 403', r.status === 403, `status ${r.status}`);
  comprobar('El 403 explica que falta aprobación', /aprobaci/i.test(r.body?.error || ''), r.body?.error);
  comprobar('No entrega token a una cuenta pendiente', !r.body?.token);

  r = await pedir('/api/auth/register', json('POST',
    { nombre: 'X', email: 'x@x.cl', password: 'valida123', estado: 'aprobado', rol: 'admin' }));
  const colado = await User.findOne({ email: 'x@x.cl' }).lean();
  comprobar('El registro NO acepta estado ni rol desde el body',
    !colado || (colado.estado === 'pendiente' && colado.rol === 'miembro'),
    JSON.stringify({ estado: colado?.estado, rol: colado?.rol }));

  r = await pedir('/api/usuarios?estado=pendiente', conToken(tokenAdmin));
  comprobar('Admin puede filtrar por estado → 200', r.status === 200, `status ${r.status}`);
  comprobar('Solo devuelve pendientes',
    r.body.usuarios.every(u => u.estado === 'pendiente'),
    JSON.stringify(r.body.usuarios.map(u => u.estado)));

  r = await pedir('/api/usuarios?estado=inventado', conToken(tokenAdmin));
  comprobar('Estado inválido en el filtro → 400', r.status === 400, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${enEspera._id}/aprobar`, { method: 'PUT', ...conToken(tokenMiembro) });
  comprobar('Un miembro no puede aprobar → 403', r.status === 403, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${enEspera._id}/aprobar`, { method: 'PUT' });
  comprobar('Aprobar sin token → 401', r.status === 401, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${enEspera._id}/aprobar`, { method: 'PUT', ...conToken(tokenAdmin) });
  comprobar('Admin aprueba → 200', r.status === 200, `status ${r.status} ${r.body?.error}`);
  comprobar('La respuesta refleja el estado nuevo', r.body?.usuario?.estado === 'aprobado', r.body?.usuario?.estado);

  const trasAprobar = await User.findById(enEspera._id).lean();
  comprobar('Queda registrado quién lo aprobó',
    String(trasAprobar.revisadoPor) === String(admin._id), String(trasAprobar.revisadoPor));
  comprobar('Queda registrada la fecha de revisión', !!trasAprobar.fechaRevision);

  r = await pedir('/api/auth/login', json('POST', { email: 'espera@x.cl', password: 'valida123' }));
  comprobar('Tras aprobar, la cuenta ya inicia sesión → 200', r.status === 200 && !!r.body.token, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${enEspera._id}/aprobar`, { method: 'PUT', ...conToken(tokenAdmin) });
  comprobar('Aprobar dos veces → 409', r.status === 409, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${enEspera._id}/rechazar`, { method: 'PUT', ...conToken(tokenAdmin) });
  comprobar('Admin rechaza → 200', r.status === 200, `status ${r.status}`);

  r = await pedir('/api/auth/login', json('POST', { email: 'espera@x.cl', password: 'valida123' }));
  comprobar('Una cuenta rechazada no puede entrar → 403', r.status === 403, `status ${r.status}`);
  comprobar('El mensaje de rechazo es distinto al de pendiente',
    /rechazada/i.test(r.body?.error || ''), r.body?.error);

  r = await pedir(`/api/usuarios/${admin._id}/rechazar`, { method: 'PUT', ...conToken(tokenAdmin) });
  comprobar('Un admin no puede rechazarse a sí mismo → 400', r.status === 400, `status ${r.status}`);

  r = await pedir('/api/usuarios/000000000000000000000000/aprobar', { method: 'PUT', ...conToken(tokenAdmin) });
  comprobar('Aprobar un id inexistente → 404', r.status === 404, `status ${r.status}`);

  r = await pedir('/api/usuarios/no-es-objectid/aprobar', { method: 'PUT', ...conToken(tokenAdmin) });
  comprobar('Aprobar con id mal formado → 400 (no 500)', r.status === 400, `status ${r.status}`);

  // Las cuentas anteriores a esta función no tienen el campo 'estado'.
  await User.collection.insertOne({
    nombre: 'Antiguo', email: 'antiguo@x.cl', password: hash, rol: 'miembro', fechaRegistro: new Date()
  });
  r = await pedir('/api/auth/login', json('POST', { email: 'antiguo@x.cl', password: 'valida123' }));
  comprobar('Una cuenta SIN campo estado sigue pudiendo entrar → 200',
    r.status === 200 && !!r.body.token, `status ${r.status} ${r.body?.error}`);

  const antiguo = await User.findOne({ email: 'antiguo@x.cl' }).lean();

  // Regresión: findById + save() hidrataba el documento, Mongoose le aplicaba
  // el default 'pendiente' y lo grababa. Cambiarle el nombre a una cuenta
  // antigua bastaba para dejarla sin poder entrar.
  r = await pedir(`/api/usuarios/${antiguo._id}`, json('PUT', { nombre: 'Antiguo Renombrado' },
    { headers: { Authorization: `Bearer ${tokenAdmin}` } }));
  comprobar('Editar una cuenta antigua → 200', r.status === 200, `status ${r.status} ${r.body?.error}`);

  const trasEditar = await User.collection.findOne({ email: 'antiguo@x.cl' });
  comprobar('Editarla NO le inventa un estado en la base',
    trasEditar.estado === undefined, JSON.stringify(trasEditar.estado));
  comprobar('El nombre sí se guardó', trasEditar.nombre === 'Antiguo Renombrado', trasEditar.nombre);

  r = await pedir('/api/auth/login', json('POST', { email: 'antiguo@x.cl', password: 'valida123' }));
  comprobar('Y sigue pudiendo iniciar sesión tras la edición → 200',
    r.status === 200, `status ${r.status} ${r.body?.error}`);

  /* ══════════════════════════════════════════════ */
  seccion('Gestión de usuarios (admin)');

  const gestionado = await User.create({
    nombre: 'Para Editar', email: 'editar@x.cl', password: hash, estado: 'aprobado'
  });
  const putAdmin = (cuerpo) => json('PUT', cuerpo, { headers: { Authorization: `Bearer ${tokenAdmin}` } });

  r = await pedir(`/api/usuarios/${gestionado._id}`, putAdmin({ rol: 'editor' }));
  comprobar('Cambiar el rol → 200', r.status === 200, `status ${r.status} ${r.body?.error}`);
  comprobar('La respuesta trae el rol nuevo', r.body?.usuario?.rol === 'editor', r.body?.usuario?.rol);

  r = await pedir(`/api/usuarios/${gestionado._id}`, putAdmin({ rol: 'jefe-supremo' }));
  comprobar('Un rol inexistente → 400', r.status === 400, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${gestionado._id}`, putAdmin({ email: 'admin@x.cl' }));
  comprobar('Email ya usado por otro → 409', r.status === 409, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${gestionado._id}`, putAdmin({ email: 'no-es-un-email' }));
  comprobar('Email con formato inválido → 400', r.status === 400, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${gestionado._id}`, putAdmin({}));
  comprobar('Cuerpo sin campos editables → 400', r.status === 400, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${gestionado._id}`, putAdmin({ password: 'corta' }));
  comprobar('Contraseña nueva demasiado corta → 400', r.status === 400, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${gestionado._id}`,
    putAdmin({ email: '  NUEVO@X.CL  ', password: 'otraclave456' }));
  comprobar('Cambiar email y contraseña a la vez → 200', r.status === 200, `status ${r.status} ${r.body?.error}`);
  comprobar('El email se normaliza a minúsculas',
    r.body?.usuario?.email === 'nuevo@x.cl', r.body?.usuario?.email);
  comprobar('La respuesta no filtra el hash', !r.texto.includes('$2b$'));

  r = await pedir('/api/auth/login', json('POST', { email: 'nuevo@x.cl', password: 'otraclave456' }));
  comprobar('Se inicia sesión con el email y la contraseña nuevos → 200',
    r.status === 200, `status ${r.status} ${r.body?.error}`);

  r = await pedir('/api/auth/login', json('POST', { email: 'nuevo@x.cl', password: 'valida123' }));
  comprobar('La contraseña antigua ya no sirve → 401', r.status === 401, `status ${r.status}`);

  const trasCambios = await User.findById(gestionado._id).lean();
  comprobar('El cambio de contraseña no alteró el rol', trasCambios.rol === 'editor', trasCambios.rol);
  comprobar('Ni el estado', trasCambios.estado === 'aprobado', trasCambios.estado);

  r = await pedir(`/api/usuarios/${gestionado._id}`, putAdmin({ estado: 'aprobado', revisadoPor: String(admin._id) }));
  comprobar('"estado" no es editable por PUT → 400', r.status === 400, `status ${r.status}`);

  r = await pedir(`/api/usuarios/${gestionado._id}`, json('PUT', { rol: 'admin' },
    { headers: { Authorization: `Bearer ${tokenEditor}` } }));
  comprobar('Un editor no puede cambiar roles → 403', r.status === 403, `status ${r.status}`);

  /* ══════════════════════════════════════════════ */
  seccion('Escalada de privilegios');

  const usr = await User.findOne({ email: 'j@x.cl' });
  comprobar('El registro anterior creó el usuario con rol "miembro"', !usr || usr.rol === 'miembro', usr?.rol);

  /* ══════════════════════════════════════════════ */
  seccion('Documentos: la lectura exige sesión');

  // El listado dejó de ser público: es material interno de la congregación.
  r = await pedir('/api/documentos');
  comprobar('GET /api/documentos sin token → 401', r.status === 401, `status ${r.status}`);

  r = await pedir('/api/documentos', conToken('esto-no-es-un-token'));
  comprobar('GET /api/documentos con token basura → 401', r.status === 401, `status ${r.status}`);

  r = await pedir('/api/documentos/000000000000000000000000');
  comprobar('GET /api/documentos/:id sin token → 401', r.status === 401, `status ${r.status}`);

  // Un miembro corriente sí puede leer: el requisito es tener sesión, no rol.
  r = await pedir('/api/documentos', conToken(tokenMiembro));
  comprobar('GET /api/documentos con sesión de miembro → 200', r.status === 200, `status ${r.status}`);
  comprobar('Responde con paginación', typeof r.body.paginas === 'number');

  r = await pedir('/api/documentos?categoria=CategoriaFalsa', conToken(tokenMiembro));
  comprobar('Categoría inválida → 400', r.status === 400, `status ${r.status}`);

  r = await pedir('/api/documentos/no-es-un-id', conToken(tokenMiembro));
  comprobar('ID mal formado → 400 (no 500)', r.status === 400, `status ${r.status}`);

  r = await pedir('/api/documentos/000000000000000000000000', conToken(tokenMiembro));
  comprobar('ID inexistente → 404', r.status === 404, `status ${r.status}`);

  // La descarga se deja sin token a propósito: es un <a href> que no puede
  // mandar cabeceras, y solo redirige a una URL de Supabase que ya es pública.
  r = await pedir('/api/documentos/000000000000000000000000/descargar');
  comprobar('La descarga sigue sin exigir token (404, no 401)',
    r.status === 404, `status ${r.status}`);

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
  seccion('Documentos: quién puede editar y borrar');

  // Se inserta directamente porque la subida por API no puede completarse:
  // el almacenamiento apunta a un puerto muerto a propósito.
  const semilla = () => Documento.create({
    titulo: 'Partitura de prueba',
    categoria: 'Coro',
    tipoArchivo: 'pdf',
    nombreOriginal: 'prueba.pdf',
    tamanoBytes: 1234,
    archivoURL: 'http://127.0.0.1:9/archivo.pdf',
    publicId: 'uploads/prueba.pdf',
    subidoPor: admin._id
  });

  let doc = await semilla();

  r = await pedir(`/api/documentos/${doc._id}`, json('PUT', { titulo: 'Cambiado' }));
  comprobar('Editar sin token → 401', r.status === 401, `status ${r.status}`);

  r = await pedir(`/api/documentos/${doc._id}`, json('PUT', { titulo: 'Cambiado' },
    { headers: { Authorization: `Bearer ${tokenMiembro}` } }));
  comprobar('Un miembro no puede editar → 403', r.status === 403, `status ${r.status}`);

  r = await pedir(`/api/documentos/${doc._id}`, json('PUT', { titulo: 'Editado por editor' },
    { headers: { Authorization: `Bearer ${tokenEditor}` } }));
  comprobar('Un editor SÍ puede editar → 200', r.status === 200, `status ${r.status} ${r.body?.error}`);
  comprobar('El título quedó guardado',
    r.body?.documento?.titulo === 'Editado por editor', r.body?.documento?.titulo);

  r = await pedir(`/api/documentos/${doc._id}`, json('PUT', { categoria: 'NoExiste' },
    { headers: { Authorization: `Bearer ${tokenEditor}` } }));
  comprobar('Categoría inválida al editar → 400', r.status === 400, `status ${r.status}`);

  r = await pedir(`/api/documentos/${doc._id}`, { method: 'DELETE', ...conToken(tokenMiembro) });
  comprobar('Un miembro no puede borrar → 403', r.status === 403, `status ${r.status}`);

  const sigueAhi = await Documento.findById(doc._id);
  comprobar('Tras el 403 el documento sigue existiendo', !!sigueAhi);

  // Antes esto devolvía 403: borrar era exclusivo de admin. Ahora el editor
  // pasa el control de rol y llega hasta el almacenamiento, que está caído.
  r = await pedir(`/api/documentos/${doc._id}`, { method: 'DELETE', ...conToken(tokenEditor) });
  comprobar('Un editor SÍ puede borrar (llega al almacenamiento) → 502',
    r.status === 502, `status ${r.status} ${r.body?.error}`);

  r = await pedir(`/api/documentos/${doc._id}`, { method: 'DELETE', ...conToken(tokenAdmin) });
  comprobar('Un admin también puede borrar → 502', r.status === 502, `status ${r.status}`);

  const trasFalloBorrado = await Documento.findById(doc._id);
  comprobar('Si el almacenamiento falla, el documento NO se borra de Mongo', !!trasFalloBorrado);

  r = await pedir('/api/documentos/000000000000000000000000',
    { method: 'DELETE', ...conToken(tokenEditor) });
  comprobar('Borrar un id inexistente → 404', r.status === 404, `status ${r.status}`);

  await Documento.deleteMany({});

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
