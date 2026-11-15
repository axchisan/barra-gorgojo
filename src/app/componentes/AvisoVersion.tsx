// «Versión nueva lista · Actualizar» (docs/18 fase 3): un toque recarga con la versión nueva.
import { useSyncExternalStore } from "react";
import { versionNueva } from "../version";

export function AvisoVersion() {
  const hay = useSyncExternalStore(versionNueva.suscribir, versionNueva.hay);
  if (!hay) return null;
  return (
    <button className="aviso-version" onClick={() => location.reload()}>
      🔄 Versión nueva lista · <u>Actualizar</u>
    </button>
  );
}
