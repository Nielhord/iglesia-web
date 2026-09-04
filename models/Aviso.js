const mongoose = require('mongoose');
const { CATEGORIAS, ERROR_CATEGORIA } = require('../config/categorias');

const avisoSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: [150, 'El título no puede superar los 150 caracteres']
  },

  cuerpo: {
    type: String,
    required: [true, 'El aviso necesita un contenido'],
    trim: true,
    maxlength: [2000, 'El aviso no puede superar los 2000 caracteres']
  },

  categoria: {
    type: String,
    enum: { values: CATEGORIAS, message: ERROR_CATEGORIA },
    required: [true, 'La categoría es obligatoria']
  },

  // Un aviso fijado se queda arriba del todo, por encima de los recientes.
  fijado: { type: Boolean, default: false },

  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Falta el autor del aviso']
  },

  creadoEn: { type: Date, default: Date.now },
  actualizadoEn: { type: Date, default: null }
});

avisoSchema.index({ categoria: 1, fijado: -1, creadoEn: -1 });

avisoSchema.set('toJSON', {
  transform: (doc, ret) => { delete ret.__v; return ret; }
});

module.exports = mongoose.model('Aviso', avisoSchema);
