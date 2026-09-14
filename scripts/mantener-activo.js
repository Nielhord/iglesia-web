/**
 * Evita que los servicios gratuitos se pausen por inactividad.
 *
 * Supabase (Free) se pausa a los 7 dias sin peticiones A LA BASE DE DATOS.
 * MongoDB Atlas (M0) se pausa a los 60 dias sin conexiones.
 * Cualquier acceso reinicia el contador, asi que basta con tocarlos.
 *
 * Solo lee: no escribe ni borra nada.
 * Uso:  node scripts/mantener-activo.js
 */
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ quiet: true });

const {
  MONGO_URI,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_BUCKET = 'archivos',
} = process.env;

const ahora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function despertarMongo() {
  if (!MONGO_URI) throw new Error('falta MONGO_URI');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  await mongoose.connection.db.admin().ping();
  const cols = await mongoose.connection.db.listCollections().toArray();
  await mongoose.disconnect();
  return `base "${mongoose.connection.name}", ${cols.length} coleccion(es)`;
}

async function despertarSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.storage.from(SUPABASE_BUCKET).list('', { limit: 1 });
  if (error) throw error;

  // Tocar el almacenamiento NO basta: Supabase mide la inactividad sobre todo
  // por la base de datos, y este proyecto solo usa Storage. Una peticion a
  // PostgREST sí llega a Postgres y cuenta como actividad. Sin esto llegan los
  // avisos de "su proyecto sera pausado" aunque el bucket se use.
  const respuesta = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!respuesta.ok) {
    throw new Error(`PostgREST respondio ${respuesta.status}`);
  }

  return `bucket "${SUPABASE_BUCKET}" accesible + base de datos consultada`;
}

(async () => {
  console.log(`[${ahora()}] manteniendo activos los servicios`);
  let fallos = 0;

  for (const [nombre, tarea] of [['MongoDB', despertarMongo], ['Supabase', despertarSupabase]]) {
    try {
      console.log(`  ${nombre}: ${await tarea()}`);
    } catch (error) {
      fallos++;
      console.error(`  ${nombre}: FALLO - ${error.message.split('\n')[0]}`);
    }
  }

  if (fallos) {
    console.error(`\n${fallos} servicio(s) no respondieron.`);
    process.exit(1);
  }
  console.log('\nAmbos servicios respondieron.');
})();
