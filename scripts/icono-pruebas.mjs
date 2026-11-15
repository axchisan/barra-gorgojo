// Genera los íconos del entorno de pruebas (public/icono-pruebas-*.png): el ícono de la app
// con una franja roja «PRUEBA», para no confundir la app de pruebas con la de verdad en la
// pantalla de inicio (docs/18). Se corre una vez; los PNG quedan en el repositorio.
//   node scripts/icono-pruebas.mjs
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = `data:image/png;base64,${readFileSync("public/icono-512.png").toString("base64")}`;
const navegador = await chromium.launch();
for (const tam of [192, 512]) {
  const p = await navegador.newPage({ viewport: { width: tam, height: tam } });
  // La franja va dentro de la zona segura de los íconos «maskable» (el 80 % del centro).
  await p.setContent(`<!doctype html><html><body style="margin:0;width:${tam}px;height:${tam}px;position:relative;overflow:hidden;background:#FAF4E8">
    <img src="${base}" style="position:absolute;inset:0;width:100%;height:100%">
    <div style="position:absolute;left:0;right:0;top:${tam * 0.6}px;height:${tam * 0.2}px;background:#C62828;border-top:${tam * 0.015}px solid #fff;border-bottom:${tam * 0.015}px solid #fff;
      display:flex;align-items:center;justify-content:center;color:#fff;font:900 ${tam * 0.13}px/1 Arial, Helvetica, sans-serif;letter-spacing:${tam * 0.01}px">PRUEBA</div>
  </body></html>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: `public/icono-pruebas-${tam}.png`, omitBackground: false });
  await p.close();
}
await navegador.close();
console.log("listo: public/icono-pruebas-192.png y -512.png");
