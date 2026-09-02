const mongoose = require('mongoose');
const { MONGO_URI } = require('./env');

// Durante un apagado ordenado la desconexión es intencionada: sin esta
// bandera, el aviso de "reintentará automáticamente" salía siempre al salir.
let cerrandoAdrede = false;

async function conectarDB() {
  mongoose.connection.on('error', err => {
    console.error('❌ Error de conexión a MongoDB:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    if (cerrandoAdrede) return;
    console.warn('⚠️  MongoDB desconectado. Mongoose reintentará automáticamente.');
  });

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000
  });

  console.log('✅ Conectado a MongoDB');
}

async function desconectarDB() {
  cerrandoAdrede = true;
  await mongoose.connection.close();
}

module.exports = { conectarDB, desconectarDB };
