type Props = {
  etiqueta: string;
  valor: string;
  /** Muestra el valor más grande y en verde (para el número más importante). */
  destacado?: boolean;
};

/** Un número con su nombre arriba, por ejemplo "Rendimiento / 7.429 kg/ha". */
export function Dato({ etiqueta, valor, destacado = false }: Props) {
  return (
    <div>
      <dt className="text-sm text-stone-500">{etiqueta}</dt>
      <dd className={destacado ? "text-xl font-bold text-green-800" : "text-lg font-semibold"}>
        {valor}
      </dd>
    </div>
  );
}
