# 17 · Accesos de empleados (2026-11-15)

Pedido por el negocio el 2026-11-14 para el día siguiente: que una empleada (operadora del
área de comida) **no vea cómo va el día de ventas, ni deudas o cuentas de otros días**, y
que **solo pueda entrar en un horario** que controla la administración. Por defecto,
**los domingos de 8:00 a. m. a 3:00 p. m.**; los días de evento, el horario que se
decida. Quiénes son las personas y su horario real: `negocio/docs/` (regla 16).

Decisiones del negocio (2026-11-14):

| Pregunta | Respuesta |
|---|---|
| ¿Cobra? | **Sí cobra** (cuentas y abonos, quedan en la caja de su área), pero **no cierra la caja** ni ve totales: eso lo hace la administración |
| ¿Qué ve en Deudas? | **Solo lo fiado hoy** (y los pagos de hoy). No ve deudas viejas ni saldos acumulados |
| ¿A quién se le pone horario? | Por ahora **a una sola persona**. Las demás siguen sin restricción hasta que la administración decida. Las personas **nuevas** empiezan con el horario de empleado |

## 1 · Qué hay

### Permisos de vista

Dos permisos sueltos nuevos, además de «Administra deudas» (docs/15). El administrador los
tiene siempre; los demás, si se les dan en «Personas y celulares».

| Permiso | Qué deja | Sin él |
|---|---|---|
| `dia` 📊 Ve el día de ventas | La pestaña «El día» (totales, cierres de caja) y **cerrar la caja** | No ve «El día»; el servidor no le manda los cierres y rechaza `cerrar_jornada` («El cierre de caja lo hace la administración.») |
| `historial` 🗂 Ve deudas y cuentas de otros días | Todas las deudas; las cuentas cobradas de ayer que siguen en la ventana de 36 h; el detalle de cuentas viejas en Deudas | De las deudas, **solo los movimientos de hoy**; de las cuentas, las abiertas y las que tuvieron algo hoy; `/api/cuentas` solo devuelve cuentas de hoy |

«Administra deudas» incluye ver todas las deudas (no tendría sentido anular lo que no se ve).

**Esconder un botón no es seguridad** (docs/03): el servidor recorta lo que manda a cada
celular según su persona — en la foto, en las novedades y en cada operación que reparte
por WebSocket (`src/dominio/vista.ts`, función pura con sus pruebas). Quien ve menos recibe
siempre la **foto** al conectarse, nunca novedades desde su `seq`: así lo que guardó su
celular un domingo no se queda como si fuera «de hoy» el siguiente. De las operaciones
ajenas solo le llega `id`, `seq` y tipo; lo demás va en los cambios, ya recortados.

Al **entrar** una persona, el celular descarta lo confirmado que dejó la anterior y espera
la foto de la nueva (los pendientes se conservan). Si la administración cambia los
permisos de alguien que está conectado, le llega la foto nueva al instante.

**Compatibilidad.** Al desplegar, la columna `horario` es nueva: en ese momento **todos
los operadores que ya existían reciben `dia` e `historial`**, para que nadie pierda nada
sin que se decida. La administración se los quita a quien deba (ver §3).

### Horario de acceso

Cada persona (que no sea administradora) puede tener un horario (`src/dominio/horario.ts`):

- **Franjas semanales**: día de la semana, desde y hasta («domingo de 8:00 a. m. a 3:00 p. m.»).
- **Días especiales** (eventos): una fecha, desde y hasta. Se suman a las semanales.
- Una franja puede pasar de la medianoche (un evento de 6:00 p. m. a 2:00 a. m.); franjas
  seguidas se juntan.
- Sin horario: entra cuando quiera (como antes). «Sin acceso»: horario sin franjas.
- Horas de Colombia (UTC−5). El día del calendario, no la jornada de las 5:00 a. m.

Qué pasa:

| Momento | Qué hace la app |
|---|---|
| Intenta entrar fuera de su horario | No entra: «Fuera de su horario. Puede entrar el domingo a las 8:00 a. m.». Se revisa antes del PIN (no gasta intentos) |
| Está adentro y termina su franja | El servidor (alarma del Durable Object en el fin de la franja) le manda «horario» y cierra su WebSocket: la app vuelve a la entrada con el porqué. Si está sin señal, el celular sale solo a la hora (`fin`) |
| La administración le quita el horario mientras está adentro | Sale al instante |
| Tenía cosas sin enviar al terminar | **No se pierden** (regla 3). Lo anotado dentro de su franja, o hasta 15 minutos después, se acepta aunque llegue tarde; lo anotado después se rechaza con su porqué y queda en «Lo que no se aceptó» (regla 8). Si sale con pendientes, salen con la próxima persona que entre en ese celular, a nombre de quien las anotó (ADR-14) |
| Cualquier otra ruta de la API fuera de su horario | 403 `horario` |

En el menú de la persona sale «⏰ Su acceso de hoy termina a las 3:00 p. m.».

## 2 · Dónde está

| Parte | Archivo |
|---|---|
| Horario: franjas, dentro/fuera, fin, próxima, mensajes | `src/dominio/horario.ts` |
| Qué ve cada persona (recortar foto y cambios) | `src/dominio/vista.ts` |
| Columna `horario`, permisos `dia` e `historial`, `vista()`, `enHorario()` | `src/servidor/acceso.ts` |
| Revisión en `entrar`, en cada pedido, en cada mensaje del WebSocket; alarma de fin de franja; reparto recortado | `src/servidor/worker.ts` |
| Sesión con `dia`, `historial`, `horario`, `fin`; salida por horario | `src/app/sincronizacion.ts`, `src/app/memoria.ts` |
| Editor de permisos y horario | `src/app/pantallas/Personas.tsx` («Personas y celulares» → la persona ▾) |
| Sin «El día», aviso en Deudas, motivo en la entrada | `Inicio.tsx`, `Deudas.tsx`, `Entrada.tsx` |
| Pruebas | `tests/accesos.test.ts` (horario y vista), `tests/servidor/empleados.test.ts` (Worker real) |

API del administrador: `POST /api/admin/personas` con `{ accion: "horario", id, horario }`
(`null` quita la restricción) y `{ accion: "permisos", id, permisos: ["dia", "historial", "deudas"] }`.

## 3 · Cómo dejar lista a la empleada (administración)

Una vez desplegado (primero en pruebas, después en producción):

1. Menú ▾ → **Personas y celulares** → tocar el botón de la persona (el que dice sus
   áreas ▾).
2. **Quitar** «📊 Ve el día de ventas» y «🗂 Ve deudas y cuentas de otros días».
3. En «⏰ Horario de acceso», tocar **Domingos 8 a. m.–3 p. m.**.
4. Para un evento: escribir las horas, escoger la fecha y **＋ Día especial**.
5. Revisar que el botón de la persona diga «· ⏰ con horario».

Para probarlo de verdad: entrar con ella **en el entorno de pruebas** fuera de su horario
(debe decir cuándo puede entrar), darle un día especial que cubra la hora actual y entrar
(no debe ver «El día» ni deudas viejas), y quitarle el día especial con ella adentro (debe
salir sola).

## 4 · Lo que no hace (todavía)

- No hay registro de entradas y salidas por persona (sería un «control de turnos»;
  propuesto en [18](18-roadmap-2026-11.md)).
- El horario no cambia qué áreas tiene: eso sigue en «Áreas fijas» y «Acceso por un día».
- Un empleado con sesión abierta en un celular sin señal puede seguir anotando hasta su
  `fin`; después la app sale sola. Lo que anote sin señal fuera de su franja se rechaza al
  llegar (con aviso), no se pierde en silencio.
