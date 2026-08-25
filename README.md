# ForoCoches Cleaner

Userscript no oficial para mejorar el filtrado de contenido en ForoCoches.

## Funciones

- Oculta por completo los **hilos creados por usuarios de tu lista de ignorados**.
- Oculta por completo los **mensajes escritos por usuarios ignorados**, incluido el aviso nativo de “Este mensaje está oculto...”.
- Lee automáticamente la **lista de ignorados de tu propia cuenta** y la guarda temporalmente en caché.
- Incluye un filtro **opcional** para ocultar hilos cuyo título contenga el marcador `+18`.
- No rellena la paginación: si una página tiene 40 hilos y se ocultan 5, se muestran 35.
- Tolera URLs de ForoCoches con barras duplicadas, por ejemplo `/foro//showthread.php`.
- El filtro `+18` está **desactivado por defecto**.

## Filtro opcional `+18`

ForoCoches utiliza habitualmente `+18` dentro del propio título para señalar hilos de contenido adulto o sensible.

El script detecta el marcador en cualquier posición del título, por ejemplo:

- `Tema de ejemplo +18`
- `Tema de ejemplo [+18]`
- `Tema de ejemplo (+18)`
- `Tema de ejemplo+18.....`
- `PEÑA ... +18 +prv`

No se analiza el contenido del hilo: únicamente se comprueba el título.

Para activarlo o desactivarlo:

1. Abre el menú de Tampermonkey o Violentmonkey.
2. Selecciona `ForoCoches: activar filtro +18` o `ForoCoches: desactivar filtro +18`.
3. El estado queda guardado en ese navegador.

## Instalación en escritorio

Necesitas un gestor de userscripts compatible, por ejemplo **Tampermonkey** o **Violentmonkey**.

### Instalación manual

1. Instala el gestor de userscripts.
2. Crea un script nuevo.
3. Copia todo el contenido de `forocoches-cleaner.user.js`.
4. Guarda el script.
5. Entra en ForoCoches con tu sesión iniciada.

### Desde GitHub

Con un gestor de userscripts instalado, abre `forocoches-cleaner.user.js` en el repositorio y después su vista **Raw**. Según el gestor y navegador, debería ofrecer la instalación o permitir copiar el contenido directamente.

## Android

Una opción compatible es **Firefox para Android + Violentmonkey**.

1. Instala Firefox para Android.
2. Instala Violentmonkey desde los complementos de Firefox.
3. Crea un userscript nuevo.
4. Pega el contenido de `forocoches-cleaner.user.js`.
5. Guarda y navega por ForoCoches desde ese Firefox.

## Menú del script

El script añade comandos al menú del gestor de userscripts:

- **Actualizar ignorados y volver a filtrar**: fuerza una lectura nueva de tu lista de ignorados.
- **Activar/desactivar filtro +18**: cambia el filtro opcional de títulos.
- **Borrar caché del filtro**: elimina la copia local temporal de la lista de ignorados.

La lista de ignorados se actualiza automáticamente cuando caduca la caché y también cuando visitas la página de ignorados.

## Privacidad y funcionamiento

El script funciona en tu navegador.

- No publica mensajes.
- No crea hilos.
- No vota.
- No reporta usuarios.
- No envía mensajes privados.
- No añade ni elimina usuarios de tu lista de ignorados.
- No modifica contenido almacenado en ForoCoches.
- No envía tu lista de ignorados a servicios externos.

La única información adicional que consulta es la página de **tu propia lista de ignorados** en ForoCoches para saber qué usuarios debe filtrar.

Los cambios son puramente visuales y locales: el contenido sigue existiendo en ForoCoches, pero tu navegador deja de representarlo.

## Cómo detecta el contenido

### Hilos

En los listados de subforos se obtiene el autor mostrado por ForoCoches y se compara con la lista de ignorados.

Si el usuario está ignorado, se oculta el bloque completo del hilo.

Si el filtro `+18` está activado y el título contiene `+18`, también se oculta el bloque completo.

La detección de `+18` busca el marcador literal y evita coincidencias obvias como `+180`.

### Mensajes

Dentro de los hilos se utiliza el identificador numérico (`user_id`) que ForoCoches incluye en los enlaces de perfil de cada mensaje.

La comparación por ID evita depender únicamente del nombre visible del usuario.

## Comportamiento seguro

Si el HTML de ForoCoches cambia y el script no puede identificar con suficiente fiabilidad los elementos necesarios, cancela ese filtrado en lugar de ocultar contenido de forma arbitraria.

Los mensajes de diagnóstico aparecen en la consola del navegador con el prefijo:

```text
[FC Ignore Filter]
```

## Compatibilidad

Desarrollado y probado sobre el diseño moderno de ForoCoches.

El funcionamiento depende de la estructura HTML actual del sitio, por lo que futuros cambios de ForoCoches pueden requerir actualizar el script.

## Proyecto no oficial

Este proyecto no está afiliado, patrocinado ni mantenido por ForoCoches.

`ForoCoches` y las demás marcas mencionadas pertenecen a sus respectivos propietarios.

## Licencia

MIT. Consulta el archivo `LICENSE` del repositorio.

## Contribuciones

Los informes de errores y pull requests son bienvenidos.

Si encuentras una página donde el filtro no actúe correctamente, abre un issue indicando:

- tipo de página (`forumdisplay` o `showthread`);
- qué comportamiento esperabas;
- qué ocurrió realmente;
- mensajes `[FC Ignore Filter]` de la consola.

**No publiques cookies, tokens de sesión, hashes de logout ni otros datos privados en un issue.**
