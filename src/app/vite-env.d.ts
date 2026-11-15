/// <reference types="vite/client" />

/** Fecha y hora de la compilación (vite.config.ts): la versión que el celular le dice al servidor. */
declare const __VERSION__: string;

/** «pruebas» si se compiló para el entorno de pruebas (ENTORNO=pruebas); si no, «produccion». */
declare const __ENTORNO__: "pruebas" | "produccion";
