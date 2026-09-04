const mongoose = require('mongoose');
const { CATEGORIAS, ERROR_CATEGORIA } = require('../config/categorias');

const documentoSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: [150, 'El título no puede superar los 150 caracteres']
  },

  descripcion: {
    type: String,
    default: '',
    trim: true,
    maxlength: [1000, 'La descripción no puede superar los 1000 caracteres']
  },

  categoria: {
    type: String,
    enum: { values: CATEGORIAS, message: ERROR_CATEGORIA },
    required: [true, 'La categoría es obligatoria']
  },

  tipoArchivo: {
    type: String,
    required: [true, 'El tipo de archivo es obligatorio']
  },

  nombreOriginal: {
    type: String,
    required: [true, 'El nombre original del archivo es obligatorio']
  },

  tamanoBytes: { type: Number, default: 0 },

  // URL pública generada por Supabase Storage
  archivoURL: {
    type: String,
    required: [true, 'La URL pública del archivo es obligatoria']
  },

  // Ruta interna del archivo dentro del bucket (ej: uploads/uuid.pdf).
  // Es lo que se usa para borrarlo de Supabase.
  publicId: {
    type: String,
    required: [true, 'El publicId (ruta en Supabase) es obligatorio']
  },

  fechaSubida: { type: Date, default: Date.now },

  subidoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario que subió el archivo es obligatorio']
  }
});

// El listado siempre filtra por categoría y ordena por fecha.
documentoSchema.index({ categoria: 1, fechaSubida: -1 });

documentoSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Documento', documentoSchema);
module.exports.CATEGORIAS = CATEGORIAS;
