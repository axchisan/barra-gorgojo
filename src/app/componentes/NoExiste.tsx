import type { Nav } from "../navegacion";

export function NoExiste({ nav }: { nav: Nav }) {
  return (
    <main className="vacio-pantalla">
      <p>Esta cuenta ya no está en este celular.</p>
      <button className="principal" onClick={() => nav.aInicio()}>Ir a cuentas</button>
    </main>
  );
}
