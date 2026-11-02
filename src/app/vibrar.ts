// Vibración corta al tocar, donde el celular la tenga.

export const vibrar = () => { try { navigator.vibrate?.(12); } catch { /* sin vibración */ } };
