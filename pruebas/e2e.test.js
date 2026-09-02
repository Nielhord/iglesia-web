/* Prueba end-to-end: backend real en :3000 + frontend real servido en :5500,
   con las páginas ejecutadas en un DOM (jsdom) usando el JS sin modificar. */
const { MongoMemoryServer } = require('mongodb-memory-server');
const { JSDOM, VirtualConsole } = require('jsdom');
const http = require('http');
const fs = require('fs');
const path = require('path');

const FRONT = '/mnt/c/Users/dtobar/Downloads/PaginaWeb/iglesia-web-frontend';
let ok = 0, fallos = 0; const errores = [];
const comprobar = (n, c, d = '') => {
  if (c) { ok++; console.log(`  ✅ ${n}`); }
  else { fallos++; errores.push(n + (d ? ` → ${d}` : '')); console.log(`  ❌ ${n}${d ? ' → ' + d : ''}`); }
};
const seccion = t => console.log(`\n\x1b[1m── ${t} ──\x1b[0m`);
const esperar = ms => new Promise(r => setTimeout(r, ms));

const TIPOS = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
                '.png':'image/png', '.jpg':'image/jpeg' };

(async () => {
  /* ---------- Backend ---------- */
  const mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri() + 'e2e',
    JWT_SECRET: 'z'.repeat(64), SUPABASE_URL: 'http://127.0.0.1:9',
    SUPABASE_SERVICE_ROLE_KEY: 'k', BASE_URL: 'http://localhost:3000',
    CORS_ORIGIN: 'http://localhost:5500,http://127.0.0.1:5500', MAX_FILE_SIZE_MB: '10'
  });

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../models/User');
  const Documento = require('../models/Documento');
  const bcrypt = require('bcrypt');

  const api = require('../app').listen(3000);
  await new Promise(r => api.once('listening', r));

  /* ---------- Datos de prueba ---------- */
  const autor = await User.create({
    nombre: 'Pastor Ruiz', email: 'pastor@iedp.cl',
    password: await bcrypt.hash('valida123', 12), rol: 'editor'
  });
  const semilla = [
    ['En nombre de Jesús', 'Coro', 'pdf', 'Acordes y letra'],
    ['Himnario completo', 'Coro', 'pdf', ''],
    ['Acta reunión marzo', 'Varones', 'pdf', 'Acta mensual'],
    ['Guía EBD lección 4', 'EBD', 'docx', 'Material para maestros'],
    ['<img src=x onerror=alert(1)>', 'General', 'pdf', 'Título con HTML dentro']
  ];
  for (const [titulo, categoria, tipo, desc] of semilla) {
    await Documento.create({
      titulo, categoria, descripcion: desc, tipoArchivo: tipo,
      nombreOriginal: 'a.' + tipo, tamanoBytes: 254000,
      archivoURL: 'https://ejemplo.test/a.' + tipo,
      publicId: 'uploads/a.' + tipo, subidoPor: autor._id
    });
  }

  /* ---------- Servidor estático del frontend ---------- */
  const estatico = http.createServer((req, res) => {
    const limpio = decodeURIComponent(req.url.split('?')[0]);
    const destino = path.join(FRONT, limpio === '/' ? 'index.html' : limpio);
    if (!destino.startsWith(FRONT) || !fs.existsSync(destino) || fs.statSync(destino).isDirectory()) {
      res.writeHead(404); return res.end('no encontrado');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream' });
    fs.createReadStream(destino).pipe(res);
  }).listen(5500);
  await new Promise(r => estatico.once('listening', r));

  /* ---------- Cargador de páginas en jsdom ---------- */
  async function abrir(pagina, espera = 1600) {
    const vc = new VirtualConsole();
    const errs = [];
    vc.on('jsdomError', e => errs.push(e.message));
    vc.on('error', (...a) => errs.push(a.join(' ')));

    const url = `http://localhost:5500/${pagina}`;
    const dom = await JSDOM.fromURL(url, {
      runScripts: 'dangerously', resources: 'usable',
      pretendToBeVisual: true, virtualConsole: vc
    });
    const w = dom.window;
    // jsdom no trae fetch: se inyecta el de Node resolviendo rutas relativas.
    w.fetch = (entrada, opciones) =>
      fetch(new URL(typeof entrada === 'string' ? entrada : entrada.url, url).href, opciones);
    await esperar(espera);
    return { dom, w, doc: w.document, errs };
  }

  /* ══════════════════════════════════════════════ */
  seccion('Portada (index.html)');
  {
    const { w, doc, errs, dom } = await abrir('index.html');
    comprobar('Carga sin errores de JavaScript', errs.length === 0, errs[0]);
    comprobar('Título propio de la página', /Iglesia Evangélica de Dios Pentecostal/.test(doc.title), doc.title);
    comprobar('Tiene meta description', !!doc.querySelector('meta[name="description"]'));
    comprobar('Tiene favicon', !!doc.querySelector('link[rel="icon"]'));
    comprobar('Tiene Open Graph', !!doc.querySelector('meta[property="og:title"]'));
    comprobar('Tiene landmark <main>', !!doc.querySelector('main'));

    comprobar('La navbar se inyectó', !!doc.querySelector('#navbar .custom-navbar'));
    const enlaces = [...doc.querySelectorAll('#navbar a[href]')].map(a => a.getAttribute('href'));
    comprobar('La navbar enlaza login.html y register.html',
      enlaces.includes('login.html') && enlaces.includes('register.html'));
    const activo = doc.querySelector('#navbar .nav-link.activo');
    comprobar('Marca "Inicio" como enlace activo', activo && activo.getAttribute('href') === 'index.html',
      activo?.getAttribute('href'));
    comprobar('El enlace activo lleva aria-current', !!doc.querySelector('#navbar [aria-current="page"]'));

    const dia = doc.getElementById('meetingDay').textContent.trim();
    const hora = doc.getElementById('meetingTime').textContent.trim();
    comprobar('Calcula la próxima reunión', dia.length > 0, `día="${dia}"`);
    comprobar('Muestra la hora', /\d{1,2}:\d{2}\s*hrs/.test(hora), `hora="${hora}"`);
    console.log(`     → «${doc.getElementById('meetingLabel').textContent.trim()} ${dia} ${hora.replace(/\s+/g,' ')}»`);

    const btn = doc.querySelector('.hero-btn');
    comprobar('El botón del hero ya no apunta a "#"', btn.getAttribute('href') !== '#', btn.getAttribute('href'));
    comprobar('El destino del botón existe en la página',
      !!doc.querySelector(btn.getAttribute('href')), btn.getAttribute('href'));

    const flechas = doc.querySelectorAll('.temples-arrow');
    comprobar('Las flechas tienen type="button"', [...flechas].every(f => f.type === 'button'));
    comprobar('Las flechas tienen aria-label', [...flechas].every(f => f.hasAttribute('aria-label')));
    const externos = [...doc.querySelectorAll('a[target="_blank"]')];
    comprobar('Todos los enlaces externos llevan rel="noopener"',
      externos.every(a => (a.getAttribute('rel') || '').includes('noopener')), `${externos.length} enlaces`);
    dom.window.close();
  }

  seccion('Listado de documentos (documentos.html)');
  {
    const { w, doc, errs, dom } = await abrir('documentos.html', 2000);
    comprobar('Carga sin errores de JavaScript', errs.length === 0, errs[0]);
    comprobar('Título propio', doc.title === 'Documentos | IEDP Talca', doc.title);

    const tarjetas = doc.querySelectorAll('.documento-card');
    comprobar('Pinta los 5 documentos de la API', tarjetas.length === 5, `${tarjetas.length} tarjetas`);

    const titulos = [...doc.querySelectorAll('.documento-titulo')].map(t => t.textContent);
    comprobar('Muestra los títulos reales', titulos.includes('En nombre de Jesús'), titulos.join(' | '));

    // El título malicioso debe verse como TEXTO, no ejecutarse como HTML.
    const inyectado = [...doc.querySelectorAll('.documento-titulo')]
      .find(t => t.textContent.includes('onerror'));
    comprobar('Un título con HTML se muestra como texto plano', !!inyectado);
    comprobar('NO se creó un <img> a partir de ese título',
      !doc.querySelector('.documento-card img'), 'se inyectó HTML');

    comprobar('Muestra el nombre de quien subió', doc.body.textContent.includes('Pastor Ruiz'));
    comprobar('NO filtra el email del subidor', !doc.body.textContent.includes('pastor@iedp.cl'), 'email expuesto');
    const meta = doc.querySelector('.documento-meta').textContent.replace(/\s+/g,' ').trim();
    comprobar('Formatea el tamaño del archivo', /\d+ (B|KB|MB)/.test(meta), meta);
    console.log(`     → metadatos de la 1ª tarjeta: «${meta}»`);
    comprobar('Formatea la fecha en español', /de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/.test(doc.body.textContent));

    const descarga = doc.querySelector('.documento-descargar');
    comprobar('El enlace de descarga apunta al backend',
      descarga.href.startsWith('http://localhost:3000/api/documentos/'), descarga.href);
    comprobar('El enlace de descarga tiene aria-label descriptivo',
      /Descargar .+/.test(descarga.getAttribute('aria-label')), descarga.getAttribute('aria-label'));

    const filtros = doc.querySelectorAll('.filtro-btn');
    comprobar('Renderiza los filtros de categoría', filtros.length === 7, `${filtros.length} botones`);
    comprobar('"Todos" está activo al inicio',
      doc.querySelector('.filtro-btn[aria-pressed="true"]')?.textContent === 'Todos');

    // Clic real en el filtro "Coro"
    [...filtros].find(f => f.textContent === 'Coro').click();
    await esperar(900);
    comprobar('Filtrar por "Coro" deja solo 2 documentos',
      doc.querySelectorAll('.documento-card').length === 2,
      `${doc.querySelectorAll('.documento-card').length} tarjetas`);
    dom.window.close();
  }

  seccion('Página de rama (coro.html)');
  {
    const { doc, errs, dom } = await abrir('coro.html', 1800);
    comprobar('Carga sin errores', errs.length === 0, errs[0]);
    comprobar('Título propio', doc.title === 'Coro Instrumental | IEDP Talca', doc.title);
    comprobar('Lista solo los documentos de la categoría Coro',
      doc.querySelectorAll('.documento-card').length === 2,
      `${doc.querySelectorAll('.documento-card').length} tarjetas`);
    comprobar('No muestra filtros (categoría fija)', doc.querySelectorAll('.filtro-btn').length === 0);
    comprobar('Marca la rama activa en el desplegable',
      !!doc.querySelector('#navbar .dropdown-toggle.activo'));
    dom.window.close();
  }

  seccion('Página sin documentos (dorcas.html)');
  {
    const { doc, dom } = await abrir('dorcas.html', 1800);
    comprobar('Muestra estado vacío en vez de quedarse en blanco',
      /Todavía no hay documentos/.test(doc.body.textContent));
    comprobar('No deja el mensaje de "Cargando" colgado',
      !/Cargando documentos/.test(doc.body.textContent));
    dom.window.close();
  }

  seccion('Registro e inicio de sesión (flujo real)');
  {
    const { w, doc, errs, dom } = await abrir('register.html');
    comprobar('register.html carga sin errores', errs.length === 0, errs[0]);
    comprobar('El formulario tiene labels asociadas a cada input',
      [...doc.querySelectorAll('.campo input')].every(i => doc.querySelector(`label[for="${i.id}"]`)));

    // Contraseñas que no coinciden → validación en cliente
    doc.getElementById('nombre').value = 'Ana Torres';
    doc.getElementById('email').value = 'ana@iedp.cl';
    doc.getElementById('password').value = 'valida123';
    doc.getElementById('password2').value = 'otracosa123';
    doc.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await esperar(400);
    comprobar('Avisa si las contraseñas no coinciden',
      /no coinciden/.test(doc.getElementById('mensaje').textContent),
      doc.getElementById('mensaje').textContent);

    // Registro correcto
    doc.getElementById('password2').value = 'valida123';
    doc.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await esperar(1500);
    const creada = await User.findOne({ email: 'ana@iedp.cl' });
    comprobar('El registro crea el usuario en la base de datos', !!creada);
    comprobar('El usuario nuevo recibe el rol "miembro"', creada?.rol === 'miembro', creada?.rol);
    comprobar('Guarda el token en localStorage', !!w.localStorage.getItem('iedp_token'));
    dom.window.close();
  }
  {
    const { w, doc, dom } = await abrir('login.html');
    doc.getElementById('email').value = 'pastor@iedp.cl';
    doc.getElementById('password').value = 'incorrecta';
    doc.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await esperar(1500);
    const msg = doc.getElementById('mensaje').textContent;
    comprobar('Login con contraseña errónea muestra el error de la API',
      /Email o contraseña incorrectos/.test(msg), msg);
    comprobar('No inicia sesión', !w.localStorage.getItem('iedp_token'));
    dom.window.close();
  }

  seccion('Backend caído: el frontend no debe romperse');
  {
    await new Promise(r => api.close(r));
    const { doc, errs, dom } = await abrir('documentos.html', 2000);
    comprobar('La página sigue cargando sin errores de JS', errs.length === 0, errs[0]);
    comprobar('Muestra un mensaje de error legible',
      /No se pudo conectar con el servidor/.test(doc.body.textContent),
      doc.querySelector('.estado')?.textContent);
    comprobar('La navbar sigue funcionando', !!doc.querySelector('#navbar .custom-navbar'));
    dom.window.close();
  }

  console.log(`\n\x1b[1m${'═'.repeat(56)}\x1b[0m`);
  console.log(`\x1b[1mRESULTADO E2E: ${ok} correctas, ${fallos} fallidas\x1b[0m`);
  if (fallos) { console.log('\nFallos:'); errores.forEach(e => console.log('  •', e)); }
  console.log('═'.repeat(56));

  estatico.close(); await mongoose.disconnect(); await mongo.stop();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('\n💥', e); process.exit(2); });
