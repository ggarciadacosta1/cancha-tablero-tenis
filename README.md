# Cancha

Tablero de tenis táctil para tablet o celular. PWA sin backend, cuenta ni dependencias. Los partidos, fotos comprimidas e historial de tantos se guardan en el almacenamiento local del navegador.

## Iniciar

Serví esta carpeta mediante HTTP local (por ejemplo, con Python instalado: `python -m http.server 8000`) y abrí `http://localhost:8000` desde el mismo dispositivo.

**Tablet Android:** todavía falta desplegarla en HTTPS para probarla en la tablet. Una vía concreta es crear un repositorio **público** en GitHub con estos archivos en la raíz y, en **Settings → Pages**, elegir **Deploy from a branch → main → /(root) → Save**. Esperá a que Pages publique `https://<usuario>.github.io/<repositorio>/` (el código será público). Si no querés publicar el código, usá otro alojamiento HTTPS privado bajo tu control. En la tablet, abrí la URL HTTPS en Chrome con internet, esperá la primera carga completa y abrí el menú ⋮ → **Instalar app** (o **Agregar a pantalla principal**). Abrila desde el icono y probá un partido corto. Después activá modo avión, cerrá y volvé a abrir la app para comprobar que la instalación concreta funciona sin conexión **antes del torneo**. Exportá un respaldo desde la tablet. El HTTP de la IP local de la PC sirve para probar la interfaz si ambos dispositivos están en la misma red, **pero no habilita la PWA offline en Chrome Android**. `file://` tampoco admite service workers. No se ha comprobado aún el funcionamiento en la tablet real.

## Reglas y uso

- Singles o dobles; las fotos son opcionales. Se elige el primer sacador y, en dobles, el segundo del equipo rival: los compañeros sacan tercero y cuarto. Ese orden se mantiene todo el partido. El punto de saque del tie-break se alterna 1–2–2–2 entre sacadores del orden establecido.
- Mejor de tres sets: los dos primeros se juegan a seis games, con diferencia de dos; en 6–6 se disputa un tie-break a 7 con diferencia de dos. Si cada equipo ganó un set, el tercero es un **match tie-break a 10**, con diferencia de dos. Si un equipo gana los dos primeros, el partido termina ahí. En cada game rige ventaja, no punto decisivo.
- «Cambiar lados» invierte la disposición visual, **no** los equipos ni el servicio. No se realizan cambios automáticos de lado. El juez atribuye cada tanto al jugador que lo ganó o cometió el error; ace y doble falta corresponden obligatoriamente al sacador. «Otro» registra tantos no comprendidos en las categorías indicadas.
- Al iniciar corre el cronómetro; al terminar se detiene. Deshacer el último tanto de un partido finalizado lo reabre y reanuda el reloj **desde el momento del deshacer**, sin contar el tiempo transcurrido mientras estuvo finalizado. Las correcciones recalculan todo el marcador desde el historial y rechazan cambios que dejen tantos después del final.
- Estadísticas por equipo y, en dobles, atribuciones individuales. Descargá el resumen o compartilo mediante las opciones del dispositivo; si no existe la API de compartir, se abrirá el cliente de correo con el resumen. No se envía correo automáticamente.
- **Respaldo** descarga todos los partidos como JSON, incluidas las fotos; «Restaurar» importa ese archivo y reemplaza los partidos con el mismo identificador. Los datos no se sincronizan: limpiar almacenamiento del navegador, usar modo privado u otro dispositivo puede perderlos. Hacé respaldos periódicos, especialmente durante un torneo.

Sin login, servidor ni sincronización entre dispositivos. El modo sin conexión requiere una carga exitosa previa bajo HTTPS (o localhost) en cada dispositivo.
