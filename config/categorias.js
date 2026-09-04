// Las seis ramas del sitio. Documentos, actividades y avisos comparten esta
// lista: si algún día se añade una rama, se toca aquí y en la navbar.
const CATEGORIAS = ['Varones', 'Dorcas', 'Jovenes', 'Coro', 'EBD', 'General'];

const ERROR_CATEGORIA = `La categoría debe ser una de: ${CATEGORIAS.join(', ')}`;

module.exports = { CATEGORIAS, ERROR_CATEGORIA };
