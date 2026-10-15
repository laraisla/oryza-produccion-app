// Clases de Tailwind que se repiten en varias pantallas. Tenerlas en un solo
// lugar mantiene el diseño parejo: si cambiamos un botón, cambian todos.

const foco =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-green-700";

export const estilos = {
  // Botones altos (56 px) para tocarlos fácil con el dedo, incluso con guantes.
  botonPrincipal: `flex h-14 w-full items-center justify-center rounded-xl bg-green-700 px-5 text-lg font-semibold text-white shadow-sm hover:bg-green-800 active:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60 ${foco}`,
  botonSecundario: `flex h-14 w-full items-center justify-center rounded-xl border-2 border-green-700 bg-white px-5 text-lg font-semibold text-green-800 hover:bg-green-50 active:bg-green-100 ${foco}`,
  campo: `h-14 w-full rounded-xl border border-stone-300 bg-white px-4 text-lg text-stone-900 placeholder:text-stone-400 focus:border-green-700 focus:ring-2 focus:ring-green-700/30 focus:outline-none`,
  contenedor: "mx-auto w-full max-w-md px-4",
};
