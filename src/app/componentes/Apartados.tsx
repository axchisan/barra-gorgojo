import { sinc } from "../sincronizacion";

/**
 * Anotaciones de una base anterior que este celular no alcanzó a enviar. No se mandan a
 * la base nueva (podrían revivir cuentas descartadas): se avisan y el administrador las
 * descarga para revisarlas y anotarlas a mano si hace falta. Ver negocio/docs/10.
 */
export function Apartados() {
  const n = sinc.apartados.length;
  if (!n) return null;
  const esAdministrador = sinc.esAdministrador;
  const descargar = () => {
    const blob = new Blob([JSON.stringify(sinc.apartados, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `anotaciones-apartadas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="alerta apartados" role="alert">
      <p>
        {n === 1 ? "Una anotación" : `${n} anotaciones`} de antes del cambio de base no se enviaron y quedaron
        guardadas aparte en este celular.{esAdministrador ? "" : " Avise al administrador."}
      </p>
      {esAdministrador && (
        <div className="fila-botones">
          <button className="secundario" onClick={descargar}>Descargar</button>
          <button className="peligro" onClick={() => sinc.olvidarApartados()}>Ya las revisé</button>
        </div>
      )}
    </div>
  );
}
