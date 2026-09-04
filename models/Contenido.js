const mongoose = require('mongoose');
const { CLAVES } = require('../config/contenido');

const contenidoSchema = new mongoose.Schema({
  clave: {
    type: String,
    required: true,
    unique: true,
    enum: { values: CLAVES, message: `La clave debe ser una de: ${CLAVES.join(', ')}` }
  },

  valor: {
    type: String,
    required: [true, 'El contenido no puede ir vacío'],
    trim: true,
    // El tope por clave lo comprueba el controlador; este es el freno general.
    maxlength: [2000, 'El contenido no puede superar los 2000 caracteres']
  },

  actualizadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  actualizadoEn: { type: Date, default: Date.now }
});

contenidoSchema.set('toJSON', {
  transform: (doc, ret) => { delete ret.__v; return ret; }
});

module.exports = mongoose.model('Contenido', contenidoSchema);
