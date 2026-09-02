// Carga y valida las variables de entorno una sola vez, al arrancar.
// Si falta alguna obligatoria, el proceso muere aquí en vez de fallar
// más tarde con un error confuso en mitad de una petición.
require('dotenv').config({ quiet: true });

const OBLIGATORIAS = [
  'JWT_SECRET',
  'MONGO_URI',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const faltantes = OBLIGATORIAS.filter(nombre => !process.env[nombre]);

if (faltantes.length > 0) {
  console.error('❌ Faltan variables de entorno obligatorias:', faltantes.join(', '));
  console.error('   Copia .env.example a .env y completa los valores.');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET es demasiado corto (mínimo 32 caracteres).');
  console.error('   Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;

module.exports = {
  PORT,
  NODE_ENV: process.env.NODE_ENV || 'development',
  esProduccion: process.env.NODE_ENV === 'production',

  BASE_URL: process.env.BASE_URL || `http://localhost:${PORT}`,

  // "a.com, b.com" -> ['a.com', 'b.com']
  CORS_ORIGINS: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',

  MONGO_URI: process.env.MONGO_URI,

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_BUCKET: process.env.SUPABASE_BUCKET || 'archivos',

  MAX_FILE_SIZE_BYTES: (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024
};
