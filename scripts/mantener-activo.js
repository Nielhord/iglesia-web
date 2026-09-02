/**
 * Evita que los servicios gratuitos se pausen por inactividad.
 *
 * Supabase (Free) se pausa a los 7 dias sin peticiones.
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
  const { data, error } = await sb.storage.from(SUPABASE_BUCKET).list('', { limit: 1 });
  if (error) throw error;
  return `bucket "${SUPABASE_BUCKET}" accesible`;
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
