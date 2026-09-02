const { PORT, NODE_ENV, BASE_URL, CORS_ORIGINS } = require('./config/env');
const { conectarDB, desconectarDB } = require('./config/db');
const app = require('./app');

let servidor;

async function iniciar() {
  try {
    await conectarDB();
  } catch (error) {
    console.error('\n❌ No se pudo conectar a MongoDB Atlas');
    console.error('   Error:', error.message);
    console.error('\n🔧 Comprueba:');
    console.error('   1. MONGO_URI en tu archivo .env');
    console.error('   2. Que tu IP esté autorizada en Atlas → Network Access');
    console.error('   3. Que el usuario tenga permisos de lectura/escritura\n');
    process.exit(1);
  }

  servidor = app.listen(PORT, () => {
    console.log('\n🎉 Servidor iniciado');
    console.log(`   Entorno : ${NODE_ENV}`);
    console.log(`   URL     : ${BASE_URL}`);
    console.log(`   API     : ${BASE_URL}/api`);
    console.log(`   CORS    : ${CORS_ORIGINS.join(', ') || '(ninguno configurado)'}`);
    console.log('\n   Ctrl+C para detener\n');
  });
}

// Cierre ordenado: deja de aceptar conexiones, espera a las que están en
// curso y cierra Mongo antes de salir.
async function cerrar(senal) {
  console.log(`\n${senal} recibido, cerrando...`);

  const forzar = setTimeout(() => {
    console.error('⚠️  Cierre forzado tras 10s');
    process.exit(1);
  }, 10000);
  forzar.unref();

  try {
    if (servidor) {
      await new Promise(resolve => servidor.close(resolve));
    }
    await desconectarDB();
    console.log('✅ Cerrado correctamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al cerrar:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => cerrar('SIGINT'));
process.on('SIGTERM', () => cerrar('SIGTERM'));

// Una promesa rechazada sin capturar deja el proceso en estado indefinido:
// se registra y se cierra ordenadamente en vez de seguir sirviendo peticiones.
process.on('unhandledRejection', (razon) => {
  console.error('❌ Promesa rechazada sin manejar:', razon);
  cerrar('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
  cerrar('uncaughtException');
});

iniciar();
