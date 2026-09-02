# Pruebas

Dos suites que verifican la API y el sitio de punta a punta. **No tocan
MongoDB Atlas ni Supabase**: usan una base de datos en memoria y apuntan
Supabase a una dirección muerta a propósito.

## Requisitos

Necesitan dos paquetes que **no** están en `package.json`, porque
`mongodb-memory-server` descarga un binario de MongoDB de ~100 MB y no tiene
sentido imponer eso en cada `npm install`:

```bash
npm install --no-save mongodb-memory-server jsdom
```

## Ejecutar

```bash
node pruebas/api.test.js    # 60 comprobaciones de la API
node pruebas/e2e.test.js    # 50 comprobaciones del sitio en un DOM real
```

Salen con código 0 si todo pasa, 1 si algo falla.

## Qué cubren

**`api.test.js`** — cabeceras de helmet, CORS (origen permitido y denegado),
validación de registro, límites de peticiones, no enumeración de usuarios en
el login, normalización de emails, expiración y formato del token, los tres
roles, mass assignment en `PUT /usuarios/:id`, un admin que no puede
degradarse ni borrarse, filtro de MIME y de tamaño en las subidas, códigos de
error correctos (400/401/403/404/409/415/429/502 en vez de 500) y que ninguna
respuesta filtre contraseñas.

**`e2e.test.js`** — levanta el backend y sirve el frontend, y carga las
páginas reales en un DOM: metadatos y favicon, inyección de la navbar y enlace
activo, cálculo de la próxima reunión, listado y filtrado de documentos,
que un título con HTML se pinte como texto y no se ejecute, que no se filtre
el email de quien sube, el flujo completo de registro y login, y que el sitio
degrade con un mensaje legible cuando el backend está caído.

## Nota

`e2e.test.js` apunta al frontend con una ruta absoluta (constante `FRONT`).
Ajústala si mueves el proyecto.
