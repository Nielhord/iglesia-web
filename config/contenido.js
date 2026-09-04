// Trozos de texto del sitio que un editor puede cambiar sin tocar el HTML.
// La clave es el contrato: el frontend pide estas mismas y no otras.
//
// Cada entrada trae su texto por defecto, que es lo que se muestra mientras
// nadie lo haya cambiado. Así la página nunca sale vacía, ni siquiera con la
// colección de contenidos recién creada.
const CONTENIDOS = {
  versiculo_texto: {
    etiqueta: 'Versículo de la portada',
    maximo: 400,
    defecto: 'Yo me alegré con los que me decían:\nA la casa de Jehová iremos.'
  },
  versiculo_referencia: {
    etiqueta: 'Referencia del versículo',
    maximo: 60,
    defecto: 'Salmos 122:1'
  }
};

const CLAVES = Object.keys(CONTENIDOS);

// Lo que se sirve cuando la base todavía no tiene nada guardado.
function porDefecto() {
  const salida = {};
  for (const clave of CLAVES) salida[clave] = CONTENIDOS[clave].defecto;
  return salida;
}

module.exports = { CONTENIDOS, CLAVES, porDefecto };
