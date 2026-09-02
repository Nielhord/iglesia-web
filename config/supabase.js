const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET } = require('./env');

// Se usa la service role key porque el servidor necesita saltarse las
// políticas RLS para escribir en el bucket. Esta clave NUNCA debe salir
// del backend ni aparecer en el frontend.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const bucket = () => supabase.storage.from(SUPABASE_BUCKET);

module.exports = { supabase, bucket };
