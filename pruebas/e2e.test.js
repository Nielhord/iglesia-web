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
    password: await bcrypt.hash('valida123', 12), rol: 'editor',
    // Sin esto quedaría 'pendiente' por defecto y no podría iniciar sesión.
    estado: 'aprobado'
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

  // Documentos y ramas dejaron de ser públicos, así que las pruebas de esas
  // páginas necesitan una sesión desde el principio.
  const hashComun = await bcrypt.hash('valida123', 12);
  await User.create({
    nombre: 'Admin Prueba', email: 'admin@iedp.cl',
    password: hashComun, rol: 'admin', estado: 'aprobado'
  });
  await User.create({
    nombre: 'Miembro Prueba', email: 'miembro@iedp.cl',
    password: hashComun, rol: 'miembro', estado: 'aprobado'
  });

  const iniciarSesion = async (email) => {
    const r = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'valida123' })
    });
    const datos = await r.json();
    return { token: datos.token, usuario: datos.usuario };
  };

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

  const lector = await iniciarSesion('miembro@iedp.cl');

  /* ---------- Cargador de páginas en jsdom ---------- */
  // 'sesion' permite dejar el token en localStorage ANTES de que corran los
  // scripts de la página: si se pusiera después, navbar.js y aprobaciones.js
  // ya habrían decidido que no hay sesión.
  async function abrir(pagina, espera = 1600, sesion = null) {
    const vc = new VirtualConsole();
    const errs = [];
    vc.on('jsdomError', e => errs.push(e.message));
    vc.on('error', (...a) => errs.push(a.join(' ')));

    const url = `http://localhost:5500/${pagina}`;
    const dom = await JSDOM.fromURL(url, {
      runScripts: 'dangerously', resources: 'usable',
      pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(ventana) {
        if (!sesion) return;
        ventana.localStorage.setItem('iedp_token', sesion.token);
        ventana.localStorage.setItem('iedp_usuario', JSON.stringify(sesion.usuario));
      }
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
    comprobar('"Conócenos más" lleva a Quiénes somos',
      btn.getAttribute('href') === '#quienes-somos', btn.getAttribute('href'));
    comprobar('El destino del botón existe en la página',
      !!doc.querySelector(btn.getAttribute('href')), btn.getAttribute('href'));

    const nosotros = doc.getElementById('quienes-somos');
    comprobar('La sección tiene su encabezado',
      nosotros.querySelector('.nosotros-title')?.textContent.trim() === 'Quiénes somos');
    const tarjetas = [...nosotros.querySelectorAll('.nosotros-card-title')].map(t => t.textContent.trim());
    comprobar('Incluye misión y visión',
      tarjetas.includes('Nuestra misión') && tarjetas.includes('Nuestra visión'),
      tarjetas.join(' | '));
    comprobar('La sección va antes de los templos',
      !!(nosotros.compareDocumentPosition(doc.getElementById('templos-locales'))
        & w.Node.DOCUMENT_POSITION_FOLLOWING));

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
    const { w, doc, errs, dom } = await abrir('documentos.html', 2000, lector);
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
    const { doc, errs, dom } = await abrir('coro.html', 1800, lector);
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
    const { doc, dom } = await abrir('dorcas.html', 1800, lector);
    comprobar('Muestra estado vacío en vez de quedarse en blanco',
      /Todavía no hay documentos/.test(doc.body.textContent));
    comprobar('No deja el mensaje de "Cargando" colgado',
      !/Cargando documentos/.test(doc.body.textContent));
    dom.window.close();
  }

  seccion('Sin sesión: documentos y ramas quedan bloqueados');
  {
    // Sin token, js/acceso.js sustituye el listado por el aviso gris antes de
    // que js/documentos.js llegue siquiera a pedir nada a la API.
    const { doc, errs, dom } = await abrir('documentos.html', 1800);
    comprobar('documentos.html carga sin errores de JS', errs.length === 0, errs[0]);

    comprobar('Muestra el aviso de acceso', !!doc.querySelector('.acceso-aviso'));
    comprobar('Explica que hace falta iniciar sesión',
      /Necesitas iniciar sesión/.test(doc.body.textContent));

    comprobar('NO pinta ningún documento',
      doc.querySelectorAll('.documento-card').length === 0,
      `${doc.querySelectorAll('.documento-card').length} tarjetas`);
    comprobar('NO filtra títulos reales al anónimo',
      !doc.body.textContent.includes('En nombre de Jesús'));
    comprobar('NO muestra los filtros de categoría',
      doc.querySelectorAll('.filtro-btn').length === 0);
    comprobar('No deja colgado el mensaje de "Cargando"',
      !/Cargando documentos/.test(doc.body.textContent));

    const irALogin = doc.querySelector('.acceso-acciones a[href^="login.html"]');
    comprobar('Ofrece un enlace a login.html', !!irALogin, 'sin enlace');
    comprobar('El enlace vuelve a documentos.html tras entrar',
      irALogin && irALogin.getAttribute('href') === 'login.html?volver=documentos.html',
      irALogin?.getAttribute('href'));
    comprobar('Ofrece también registrarse',
      !!doc.querySelector('.acceso-acciones a[href="register.html"]'));

    const fantasma = doc.querySelector('.acceso-fantasma');
    comprobar('Pinta tarjetas grises de relleno', !!fantasma);
    comprobar('El relleno se oculta a los lectores de pantalla',
      fantasma && fantasma.getAttribute('aria-hidden') === 'true');

    comprobar('La navbar sigue disponible para navegar',
      !!doc.querySelector('#navbar .custom-navbar'));
    dom.window.close();
  }
  {
    // Las ramas usan el mismo guardián, con su propio destino de vuelta.
    const { doc, errs, dom } = await abrir('coro.html', 1800);
    comprobar('coro.html carga sin errores de JS', errs.length === 0, errs[0]);
    comprobar('La rama también queda bloqueada', !!doc.querySelector('.acceso-aviso'));
    comprobar('NO lista los documentos de Coro',
      doc.querySelectorAll('.documento-card').length === 0);
    comprobar('El enlace de login vuelve a coro.html',
      doc.querySelector('.acceso-acciones a[href^="login.html"]')?.getAttribute('href')
        === 'login.html?volver=coro.html');
    dom.window.close();
  }
  {
    // El bloqueo es solo la cara visible: quien borre el aviso no gana nada.
    const r = await fetch('http://localhost:3000/api/documentos');
    comprobar('La API rechaza el listado sin token → 401', r.status === 401, `status ${r.status}`);
  }

  /* ══════════════════════════════════════════════ */
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
    comprobar('El usuario nuevo queda "pendiente"', creada?.estado === 'pendiente', creada?.estado);

    // El registro ya no inicia sesión: la cuenta espera aprobación.
    comprobar('NO guarda token en localStorage', !w.localStorage.getItem('iedp_token'));
    comprobar('Avisa de que falta la aprobación',
      /aprob/i.test(doc.getElementById('mensaje').textContent),
      doc.getElementById('mensaje').textContent);
    comprobar('Oculta el formulario tras enviarlo', doc.querySelector('form').hidden);
    dom.window.close();
  }
  {
    // Una cuenta pendiente no puede entrar por el formulario de login.
    const { w, doc, dom } = await abrir('login.html');
    doc.getElementById('email').value = 'ana@iedp.cl';
    doc.getElementById('password').value = 'valida123';
    doc.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await esperar(1500);
    comprobar('Una cuenta pendiente no inicia sesión', !w.localStorage.getItem('iedp_token'));
    comprobar('El login explica que está pendiente de aprobación',
      /aprobaci/i.test(doc.getElementById('mensaje').textContent),
      doc.getElementById('mensaje').textContent);
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

  /* ══════════════════════════════════════════════ */
  seccion('Aprobación de registros (aprobaciones.html)');
  {
    const entrar = iniciarSesion;

    const sesionAdmin = await entrar('admin@iedp.cl');
    const sesionMiembro = await entrar('miembro@iedp.cl');

    // 'ana@iedp.cl' se registró más arriba desde el formulario y quedó pendiente.
    {
      const { doc, errs, dom } = await abrir('aprobaciones.html', 1800, sesionAdmin);
      comprobar('aprobaciones.html carga sin errores', errs.length === 0, errs[0]);

      const enlaceNavbar = doc.querySelector('[data-solo-admin]');
      comprobar('La navbar muestra "Aprobaciones" a un admin',
        enlaceNavbar && !enlaceNavbar.hidden, 'sigue oculto');

      const globo = doc.querySelector('[data-badge-pendientes]');
      comprobar('El contador de pendientes aparece con un número',
        globo && !globo.hidden && /^\d+$/.test(globo.textContent), globo?.textContent);

      const tarjetas = doc.querySelectorAll('.solicitud-card');
      comprobar('Lista al menos una solicitud pendiente', tarjetas.length >= 1, `${tarjetas.length} tarjetas`);

      const texto = doc.body.textContent;
      comprobar('Muestra el nombre de quien solicita', /Ana Torres/.test(texto));
      comprobar('Muestra su email', /ana@iedp\.cl/.test(texto));
      comprobar('La marca de estado dice "En espera"', /En espera/.test(texto));

      comprobar('Ofrece botón Aprobar', !!doc.querySelector('.btn-aprobar'));
      comprobar('Ofrece botón Rechazar', !!doc.querySelector('.btn-rechazar'));
      dom.window.close();
    }

    // Aprobar de verdad, pulsando el botón.
    {
      const { w, doc, dom } = await abrir('aprobaciones.html', 1800, sesionAdmin);
      const tarjeta = [...doc.querySelectorAll('.solicitud-card')]
        .find(t => /ana@iedp\.cl/.test(t.textContent));
      comprobar('Encuentra la tarjeta de Ana', !!tarjeta);

      tarjeta.querySelector('.btn-aprobar').dispatchEvent(new w.Event('click', { bubbles: true }));
      await esperar(1400);

      const ana = await User.findOne({ email: 'ana@iedp.cl' }).lean();
      comprobar('Pulsar "Aprobar" cambia el estado en la base de datos',
        ana?.estado === 'aprobado', ana?.estado);
      comprobar('Guarda quién la aprobó', !!ana?.revisadoPor);
      dom.window.close();
    }

    // Y ahora Ana sí puede entrar.
    {
      const r = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ana@iedp.cl', password: 'valida123' })
      });
      comprobar('Tras la aprobación, Ana inicia sesión → 200', r.status === 200, `status ${r.status}`);
    }

    // Un miembro no debe poder usar la página.
    {
      const { doc, errs, dom } = await abrir('aprobaciones.html', 1500, sesionMiembro);
      comprobar('Un miembro no ve errores de JS, ve un aviso', errs.length === 0, errs[0]);
      comprobar('Le dice que la página es solo para administradores',
        /solo para administradores/i.test(doc.body.textContent),
        doc.body.textContent.slice(0, 120));
      comprobar('No renderiza ninguna solicitud', doc.querySelectorAll('.solicitud-card').length === 0);

      const enlaceNavbar = doc.querySelector('[data-solo-admin]');
      comprobar('La navbar NO muestra "Aprobaciones" a un miembro',
        !enlaceNavbar || enlaceNavbar.hidden, 'el enlace quedó visible');
      dom.window.close();
    }

    // Sin sesión: redirige al login. jsdom no ejecuta navegaciones, así que
    // se comprueba el intento (que registra como error) y su consecuencia.
    {
      const { w, doc, errs, dom } = await abrir('aprobaciones.html', 1200);
      const intentoRedirigir = /login\.html/.test(w.location.href)
        || errs.some(e => /navigation/i.test(e));
      comprobar('Sin sesión intenta redirigir al login', intentoRedirigir,
        `${w.location.href} | ${errs.join(' ')}`);
      comprobar('Sin sesión no renderiza ninguna solicitud',
        doc.querySelectorAll('.solicitud-card').length === 0);
      dom.window.close();
    }
  }

  /* ══════════════════════════════════════════════ */
  seccion('Gestión de cuentas (usuarios.html)');
  {
    const hash = await bcrypt.hash('valida123', 12);
    await User.create({
      nombre: 'Rosa Díaz', email: 'rosa@iedp.cl',
      password: hash, rol: 'miembro', estado: 'aprobado'
    });

    const entrar = async (email, password = 'valida123') => {
      const r = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const datos = await r.json();
      return { estado: r.status, token: datos.token, usuario: datos.usuario };
    };

    const sesionAdmin = await entrar('admin@iedp.cl');
    const sesionMiembro = await entrar('miembro@iedp.cl');

    {
      const { doc, errs, dom } = await abrir('usuarios.html', 1800, sesionAdmin);
      comprobar('usuarios.html carga sin errores', errs.length === 0, errs[0]);

      const enlaces = [...doc.querySelectorAll('[data-solo-admin] a')].map(a => a.getAttribute('href'));
      comprobar('La navbar muestra "Usuarios" a un admin',
        enlaces.includes('usuarios.html'), enlaces.join(', '));

      const tarjetas = [...doc.querySelectorAll('.solicitud-card')];
      comprobar('Lista varias cuentas', tarjetas.length >= 3, `${tarjetas.length} tarjetas`);
      comprobar('Muestra el rol de cada cuenta',
        doc.querySelectorAll('.usuario-rol').length === tarjetas.length);
      comprobar('Cada cuenta tiene selector de rol',
        doc.querySelectorAll('.usuario-form select').length === tarjetas.length);
      comprobar('Cada cuenta tiene campo de contraseña nueva',
        doc.querySelectorAll('input[type="password"]').length === tarjetas.length);

      // La propia cuenta del admin no debe poder cambiarse el rol ni borrarse.
      const propia = tarjetas.find(t => /admin@iedp\.cl/.test(t.textContent));
      comprobar('Encuentra la tarjeta del propio admin', !!propia);
      comprobar('Su selector de rol está deshabilitado', propia.querySelector('select').disabled);
      comprobar('No ofrece eliminarse a sí mismo', !propia.querySelector('.btn-rechazar'));
      comprobar('Explica por qué', /No puedes cambiar tu propio rol/.test(propia.textContent));

      const ajena = tarjetas.find(t => /rosa@iedp\.cl/.test(t.textContent));
      comprobar('En una cuenta ajena sí se puede editar el rol', !ajena.querySelector('select').disabled);
      comprobar('Y sí ofrece eliminarla', !!ajena.querySelector('.btn-rechazar'));
      dom.window.close();
    }

    // Cambiar el rol de verdad.
    {
      const { w, doc, dom } = await abrir('usuarios.html', 1800, sesionAdmin);
      const tarjeta = [...doc.querySelectorAll('.solicitud-card')]
        .find(t => /rosa@iedp\.cl/.test(t.textContent));

      tarjeta.querySelector('select').value = 'editor';
      tarjeta.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await esperar(1400);

      const rosa = await User.findOne({ email: 'rosa@iedp.cl' }).lean();
      comprobar('Guardar cambia el rol en la base de datos', rosa?.rol === 'editor', rosa?.rol);
      comprobar('No alteró su estado', rosa?.estado === 'aprobado', rosa?.estado);
      dom.window.close();
    }

    // Cambiar correo y contraseña a la vez.
    {
      const { w, doc, dom } = await abrir('usuarios.html', 1800, sesionAdmin);
      const tarjeta = [...doc.querySelectorAll('.solicitud-card')]
        .find(t => /rosa@iedp\.cl/.test(t.textContent));

      // El cambio de contraseña pide confirmación; jsdom no la implementa.
      w.confirm = () => true;

      tarjeta.querySelector('input[type="email"]').value = 'rosa.diaz@iedp.cl';
      tarjeta.querySelector('input[type="password"]').value = 'nuevaclave789';
      tarjeta.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await esperar(1500);

      const rosa = await User.findOne({ email: 'rosa.diaz@iedp.cl' }).lean();
      comprobar('Guarda el correo nuevo', !!rosa, 'no se encontró con el email nuevo');

      const conNueva = await entrar('rosa.diaz@iedp.cl', 'nuevaclave789');
      comprobar('Inicia sesión con la contraseña nueva → 200', conNueva.estado === 200, `status ${conNueva.estado}`);

      const conVieja = await entrar('rosa.diaz@iedp.cl', 'valida123');
      comprobar('La contraseña antigua deja de servir → 401', conVieja.estado === 401, `status ${conVieja.estado}`);
      dom.window.close();
    }

    // Correo duplicado: mensaje claro, sin romper la página.
    {
      const { w, doc, dom } = await abrir('usuarios.html', 1800, sesionAdmin);
      const tarjeta = [...doc.querySelectorAll('.solicitud-card')]
        .find(t => /rosa\.diaz@iedp\.cl/.test(t.textContent));

      tarjeta.querySelector('input[type="email"]').value = 'admin@iedp.cl';
      tarjeta.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await esperar(1200);

      comprobar('Avisa de que el correo ya está en uso',
        /ya lo usa otra cuenta/i.test(tarjeta.textContent), tarjeta.textContent.slice(-120));
      dom.window.close();
    }

    // Un miembro no debe poder usar la página.
    {
      const { doc, errs, dom } = await abrir('usuarios.html', 1500, sesionMiembro);
      comprobar('Un miembro no ve errores de JS', errs.length === 0, errs[0]);
      comprobar('Le dice que es solo para administradores',
        /solo para administradores/i.test(doc.body.textContent));
      comprobar('No renderiza ninguna cuenta', doc.querySelectorAll('.solicitud-card').length === 0);
      dom.window.close();
    }
  }

  /* ══════════════════════════════════════════════ */
  seccion('Gestión de documentos (gestion-documentos.html)');
  {
    const hash = await bcrypt.hash('valida123', 12);
    await User.create({
      nombre: 'Editor Prueba', email: 'editor@iedp.cl',
      password: hash, rol: 'editor', estado: 'aprobado'
    });

    const entrar = async (email) => {
      const r = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'valida123' })
      });
      const datos = await r.json();
      return { token: datos.token, usuario: datos.usuario };
    };

    const sesionEditor = await entrar('editor@iedp.cl');
    const sesionAdmin = await entrar('admin@iedp.cl');
    const sesionMiembro = await entrar('miembro@iedp.cl');

    const enlacesVisibles = (doc) =>
      [...doc.querySelectorAll('.navbar-nav li:not([hidden]) a')].map(a => a.getAttribute('href'));

    // Un editor gestiona documentos, pero no usuarios ni aprobaciones.
    {
      const { doc, errs, dom } = await abrir('gestion-documentos.html', 1800, sesionEditor);
      comprobar('gestion-documentos.html carga sin errores', errs.length === 0, errs[0]);

      const enlaces = enlacesVisibles(doc);
      comprobar('El editor ve "Gestionar"', enlaces.includes('gestion-documentos.html'), enlaces.join(', '));
      comprobar('El editor NO ve "Usuarios"', !enlaces.includes('usuarios.html'), enlaces.join(', '));
      comprobar('El editor NO ve "Aprobaciones"', !enlaces.includes('aprobaciones.html'), enlaces.join(', '));

      comprobar('Muestra el formulario de subida', !!doc.querySelector('.subida-form'));
      comprobar('El formulario pide un archivo', !!doc.querySelector('input[type="file"]'));
      comprobar('Ofrece las 6 categorías',
        doc.querySelector('#subida-categoria')?.options.length === 6,
        String(doc.querySelector('#subida-categoria')?.options.length));
      comprobar('Restringe los tipos de archivo aceptados',
        /\.pdf/.test(doc.querySelector('input[type="file"]').accept));
      comprobar('No ofrece subir HTML ni SVG',
        !/\.html|\.svg/.test(doc.querySelector('input[type="file"]').accept),
        doc.querySelector('input[type="file"]').accept);

      const tarjetas = doc.querySelectorAll('.solicitud-card');
      comprobar('Lista los documentos existentes', tarjetas.length >= 3, `${tarjetas.length} tarjetas`);
      comprobar('Cada uno con botón de eliminar',
        doc.querySelectorAll('.btn-rechazar').length === tarjetas.length);
      comprobar('Y con enlace de descarga',
        doc.querySelectorAll('.documento-descargar').length === tarjetas.length);
      dom.window.close();
    }

    // Un admin ve las tres secciones.
    {
      const { doc, dom } = await abrir('gestion-documentos.html', 1800, sesionAdmin);
      const enlaces = enlacesVisibles(doc);
      comprobar('El admin ve "Gestionar", "Usuarios" y "Aprobaciones"',
        ['gestion-documentos.html', 'usuarios.html', 'aprobaciones.html']
          .every(h => enlaces.includes(h)), enlaces.join(', '));
      dom.window.close();
    }

    // Editar un documento de verdad.
    {
      const { w, doc, dom } = await abrir('gestion-documentos.html', 1800, sesionEditor);
      const tarjeta = [...doc.querySelectorAll('.solicitud-card')]
        .find(t => /En nombre de Jesús/.test(t.textContent));
      comprobar('Encuentra el documento a editar', !!tarjeta);

      tarjeta.querySelector('input[type="text"]').value = 'En nombre de Jesús (corregido)';
      tarjeta.querySelector('select').value = 'General';
      tarjeta.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await esperar(1400);

      const Documento = require('../models/Documento');
      const editado = await Documento.findOne({ titulo: 'En nombre de Jesús (corregido)' }).lean();
      comprobar('Guardar cambia el título en la base de datos', !!editado);
      comprobar('Y también la categoría', editado?.categoria === 'General', editado?.categoria);
      dom.window.close();
    }

    // Borrar con el almacenamiento caído: mensaje claro, sin perder el registro.
    {
      const { w, doc, dom } = await abrir('gestion-documentos.html', 1800, sesionEditor);
      const tarjeta = [...doc.querySelectorAll('.solicitud-card')]
        .find(t => /Himnario completo/.test(t.textContent));

      w.confirm = () => true;
      tarjeta.querySelector('.btn-rechazar').dispatchEvent(new w.Event('click', { bubbles: true }));
      await esperar(1400);

      comprobar('Avisa de que el almacenamiento no respondió',
        /almacenamiento no respondió/i.test(tarjeta.textContent), tarjeta.textContent.slice(-140));

      const Documento = require('../models/Documento');
      const sigue = await Documento.findOne({ titulo: 'Himnario completo' }).lean();
      comprobar('El documento no se pierde si falla el borrado del archivo', !!sigue);
      dom.window.close();
    }

    // Un miembro no debe poder entrar.
    {
      const { doc, errs, dom } = await abrir('gestion-documentos.html', 1500, sesionMiembro);
      comprobar('Un miembro no ve errores de JS', errs.length === 0, errs[0]);
      comprobar('Le dice que es solo para editores y administradores',
        /solo para editores y administradores/i.test(doc.body.textContent));
      comprobar('No renderiza el formulario de subida', !doc.querySelector('.subida-form'));
      comprobar('Su navbar no ofrece "Gestionar"',
        !enlacesVisibles(doc).includes('gestion-documentos.html'));
      dom.window.close();
    }
  }

  /* ══════════════════════════════════════════════ */
  seccion('Panel de rama: calendario y avisos (coro.html)');
  {
    const Actividad = require('../models/Actividad');
    const Aviso = require('../models/Aviso');
    const sesionEditor = await iniciarSesion('editor@iedp.cl');

    // Una actividad en el mes que el calendario abre por defecto (el actual),
    // para que salga sin tener que navegar entre meses.
    const hoy = new Date();
    const dos = n => String(n).padStart(2, '0');
    const dia = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-15`;

    await Actividad.create({
      titulo: 'Ensayo del coro', categoria: 'Coro', fecha: dia,
      hora: '19:30', lugar: 'Templo central', descripcion: 'Traer partituras.',
      creadoPor: autor._id
    });
    await Aviso.create({
      titulo: 'Suspendido el sábado', cuerpo: 'No hay ensayo este sábado.',
      categoria: 'Coro', fijado: true, creadoPor: autor._id
    });

    {
      const { doc, errs, dom } = await abrir('coro.html', 2000, lector);
      comprobar('La rama carga sin errores de JS', errs.length === 0, errs[0]);

      comprobar('Tiene las dos columnas', !!doc.querySelector('.rama-columnas'));
      comprobar('Los documentos van en una caja con scroll propio',
        !!doc.querySelector('.rama-scroll [data-documentos], .rama-scroll .documentos-lista'));
      // Las secciones anteriores editan documentos, así que el número exacto
      // se pregunta a la base en vez de fijarlo a mano.
      const enBase = await Documento.countDocuments({ categoria: 'Coro' });
      comprobar('Los documentos de la rama siguen listándose',
        doc.querySelectorAll('.rama-scroll .documento-card').length === enBase && enBase > 0,
        `${doc.querySelectorAll('.rama-scroll .documento-card').length} tarjetas, ${enBase} en base`);

      const pestanas = [...doc.querySelectorAll('.rama-pestana')].map(b => b.textContent);
      comprobar('Ofrece las pestañas Calendario y Avisos',
        pestanas.join(',') === 'Calendario,Avisos', pestanas.join(','));

      const mesActual = new Intl.DateTimeFormat('es', { month: 'long' }).format(hoy);
      comprobar('Encabeza con el mes y el año',
        doc.querySelector('.cal-mes').textContent === `${mesActual} ${hoy.getFullYear()}`,
        doc.querySelector('.cal-mes').textContent);
      comprobar('Se puede cambiar de mes', doc.querySelectorAll('.cal-flecha').length === 2);

      comprobar('Lista la actividad del mes',
        /Ensayo del coro/.test(doc.querySelector('.agenda-lista').textContent));
      comprobar('Cada actividad lleva su día en grande',
        doc.querySelector('.agenda-item .agenda-dia-numero')?.textContent === '15',
        doc.querySelector('.agenda-item .agenda-dia-numero')?.textContent);
      comprobar('Muestra la fecha completa, la hora y el lugar en texto',
        /15 de .+ · 19:30 · Templo central/.test(doc.querySelector('.agenda-detalle').textContent),
        doc.querySelector('.agenda-detalle').textContent);

      // La pestaña de avisos empieza oculta y se abre al pulsarla.
      comprobar('La vista de avisos empieza oculta',
        doc.querySelector('[data-vista="avisos"]').hidden);
      [...doc.querySelectorAll('.rama-pestana')].find(b => b.textContent === 'Avisos').click();
      comprobar('Al pulsar "Avisos" se muestra esa vista',
        !doc.querySelector('[data-vista="avisos"]').hidden
          && doc.querySelector('[data-vista="calendario"]').hidden);
      comprobar('Muestra el aviso', /Suspendido el sábado/.test(doc.body.textContent));
      comprobar('Marca el aviso fijado', !!doc.querySelector('.aviso-fijado'));

      // Un miembro solo mira.
      comprobar('Un miembro NO ve el botón de crear',
        !doc.querySelector('.rama-btn-nuevo'), 'aparece el botón');
      comprobar('Un miembro NO ve botones de editar ni eliminar',
        doc.querySelectorAll('.rama-acciones').length === 0);
      dom.window.close();
    }

    {
      const { w, doc, errs, dom } = await abrir('coro.html', 2000, sesionEditor);
      comprobar('coro.html carga sin errores para el editor', errs.length === 0, errs[0]);
      comprobar('El editor SÍ ve el botón de crear', !!doc.querySelector('.rama-btn-nuevo'));
      comprobar('El editor ve editar/eliminar en la actividad',
        doc.querySelectorAll('[data-vista="calendario"] .rama-acciones .btn-editar').length === 1,
        `${doc.querySelectorAll('[data-vista="calendario"] .rama-acciones .btn-editar').length}`);
      comprobar('Y también en el aviso',
        doc.querySelectorAll('[data-vista="avisos"] .rama-acciones .btn-eliminar').length === 1);

      // Crear una actividad de verdad desde el formulario.
      doc.querySelector('.rama-btn-nuevo').click();
      const form = doc.querySelector('.rama-form');
      comprobar('El botón despliega el formulario', form && !form.hidden);

      const entradas = form.querySelectorAll('input');
      entradas[0].value = 'Reunión de directiva';   // título
      entradas[1].value = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-20`;
      form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await esperar(1500);

      const guardada = await Actividad.findOne({ titulo: 'Reunión de directiva' });
      comprobar('La actividad nueva llega a la base de datos', !!guardada);
      comprobar('Se guarda con la categoría de la rama', guardada?.categoria === 'Coro', guardada?.categoria);
      comprobar('Aparece en la lista sin recargar la página',
        /Reunión de directiva/.test(doc.querySelector('.agenda-lista').textContent));
      comprobar('Ahora hay dos actividades en el mes',
        doc.querySelectorAll('.agenda-item').length === 2,
        `${doc.querySelectorAll('.agenda-item').length}`);
      // El día 15 se creó antes que el 20, pero manda la fecha, no el orden
      // de creación.
      comprobar('Se ordenan por fecha: primero la más cercana',
        [...doc.querySelectorAll('.agenda-dia-numero')].map(e => e.textContent).join(',') === '15,20',
        [...doc.querySelectorAll('.agenda-dia-numero')].map(e => e.textContent).join(','));
      dom.window.close();
    }

    {
      // Sin sesión: el calendario y los avisos se leen; los documentos no.
      const { doc, errs, dom } = await abrir('coro.html', 2000);
      comprobar('La rama carga sin errores para un anónimo', errs.length === 0, errs[0]);
      comprobar('El calendario se ve sin iniciar sesión',
        /Ensayo del coro/.test(doc.querySelector('.agenda-lista').textContent));
      comprobar('Los documentos siguen bloqueados', !!doc.querySelector('.acceso-aviso'));
      comprobar('Y no se filtra ningún documento',
        doc.querySelectorAll('.documento-card').length === 0);
      comprobar('Un anónimo tampoco ve botones de gestión',
        !doc.querySelector('.rama-btn-nuevo'));
      dom.window.close();
    }
  }

  /* ══════════════════════════════════════════════ */
  seccion('Versículo editable de la portada (index.html)');
  {
    const Contenido = require('../models/Contenido');
    const sesionEditor = await iniciarSesion('editor@iedp.cl');

    {
      // Una visita ve el versículo guardado y ni rastro del botón de editar.
      await Contenido.findOneAndUpdate(
        { clave: 'versiculo_texto' },
        { $set: { valor: 'Lámpara es a mis pies tu palabra.' } },
        { upsert: true }
      );

      const { doc, errs, dom } = await abrir('index.html', 1800);
      comprobar('La portada carga sin errores', errs.length === 0, errs[0]);
      comprobar('Muestra el versículo guardado, no el del HTML',
        doc.querySelector('[data-contenido="versiculo_texto"]').textContent.trim()
          === 'Lámpara es a mis pies tu palabra.',
        doc.querySelector('[data-contenido="versiculo_texto"]').textContent.trim());
      comprobar('Un anónimo NO ve el botón de editar',
        doc.querySelector('[data-editar-versiculo]').hidden);
      dom.window.close();
    }

    {
      const { doc, dom } = await abrir('index.html', 1500, lector);
      comprobar('Un miembro tampoco ve el botón de editar',
        doc.querySelector('[data-editar-versiculo]').hidden);
      dom.window.close();
    }

    {
      const { w, doc, errs, dom } = await abrir('index.html', 1800, sesionEditor);
      comprobar('La portada carga sin errores para el editor', errs.length === 0, errs[0]);

      const boton = doc.querySelector('[data-editar-versiculo]');
      comprobar('El editor SÍ ve el botón de editar', !boton.hidden);

      boton.click();
      const form = doc.querySelector('.hero-editor');
      comprobar('El botón abre el formulario', !!form);
      comprobar('Viene relleno con el versículo actual',
        form.querySelector('textarea').value === 'Lámpara es a mis pies tu palabra.',
        form.querySelector('textarea').value);

      // Guardar vacío no debe llegar siquiera a la API.
      form.querySelector('textarea').value = '   ';
      form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await esperar(500);
      comprobar('No deja guardar un versículo vacío',
        /obligatorio/i.test(doc.querySelector('.hero-editor-aviso').textContent),
        doc.querySelector('.hero-editor-aviso').textContent);

      form.querySelector('textarea').value = 'Jehová es mi pastor;\nnada me faltará.';
      form.querySelector('input').value = 'Salmos 23:1';
      form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await esperar(1500);

      const guardado = await Contenido.findOne({ clave: 'versiculo_texto' });
      comprobar('El versículo nuevo llega a la base de datos',
        guardado?.valor === 'Jehová es mi pastor;\nnada me faltará.', guardado?.valor);
      comprobar('Guarda también la referencia',
        (await Contenido.findOne({ clave: 'versiculo_referencia' }))?.valor === 'Salmos 23:1');
      comprobar('Queda anotado quién lo cambió', !!guardado?.actualizadoPor);

      comprobar('La portada se actualiza sin recargar',
        /nada me faltará/.test(doc.querySelector('[data-contenido="versiculo_texto"]').textContent));
      comprobar('El formulario se cierra al guardar', !doc.querySelector('.hero-editor'));
      dom.window.close();
    }
  }

  /* ══════════════════════════════════════════════ */
  seccion('Backend caído: el frontend no debe romperse');
  {
    await new Promise(r => api.close(r));
    const { doc, errs, dom } = await abrir('documentos.html', 2000, lector);
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
