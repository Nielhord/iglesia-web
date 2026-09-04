/**
 * Marca como "aprobado" a los usuarios creados antes de que existiera la
 * aprobación de registros.
 *
 * El código ya trata "sin estado" como aprobado, así que esto no cambia el
 * comportamiento: solo deja los datos explícitos y coherentes, para que las
 * consultas por estado devuelvan lo esperado.
 *
 * Es idempotente: ejecutarlo dos veces no hace nada la segunda.
 *
 * Uso:  npm run migrar-estados
 */
const mongoose = require('mongoose');
require('dotenv').config({ quiet: true });

const { MONGO_URI } = process.env;

(async () => {
  if (!MONGO_URI) {
    console.error('Falta MONGO_URI en el .env');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const usuarios = mongoose.connection.db.collection('users');

  const sinEstado = { $or: [{ estado: { $exists: false } }, { estado: null }] };
  const pendientesDeMigrar = await usuarios.countDocuments(sinEstado);

  if (pendientesDeMigrar === 0) {
    console.log('Nada que migrar: todos los usuarios ya tienen estado.');
  } else {
    const r = await usuarios.updateMany(sinEstado, { $set: { estado: 'aprobado' } });
    console.log(`Cuentas marcadas como aprobadas: ${r.modifiedCount}`);
  }

  const resumen = await usuarios.aggregate([
    { $group: { _id: '$estado', total: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();

  console.log('\nEstado actual:');
  for (const fila of resumen) {
    console.log(`  ${String(fila._id ?? '(sin estado)').padEnd(12)} ${fila.total}`);
  }

  await mongoose.disconnect();
})();
