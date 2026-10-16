# BULLGYM — Portal web

Este proyecto incluye una página pública, registro de clientes, acceso privado, panel de administración, asignación de rutinas, mensajería, entrenadores, promociones editables y exportación de clientes/rutinas/mensajes a Excel.

## Requisitos
- Node.js 20 o superior
- Una computadora para instalar y probar
- Para publicarlo: un servicio que permita ejecutar Node.js de forma persistente y almacenamiento persistente (por ejemplo, Render con disco persistente o un VPS).

## Ejecutar en tu computadora
1. Instala Node.js desde https://nodejs.org/
2. Descomprime el ZIP y abre la carpeta `bullgym_web`.
3. Copia `.env.example` como `.env`.
4. Cambia `SESSION_SECRET` por una cadena larga y `ADMIN_PASSWORD` por una contraseña fuerte y privada. No compartas el archivo `.env`.
5. Abre una terminal en esa carpeta y ejecuta:
   ```bash
   npm install
   npm start
   ```
6. Abre `http://localhost:3000`.
7. Acceso inicial: usuario `admin` y la contraseña que pusiste en `ADMIN_PASSWORD`.

## Publicar en internet (resumen)
1. Crea un repositorio privado en GitHub y sube el contenido del proyecto, excepto `.env`, `node_modules` y la carpeta `data`.
2. En Render, crea un servicio **Web Service** conectado a ese repositorio.
3. Build command: `npm install`
4. Start command: `npm start`
5. Configura variables de entorno `NODE_ENV=production`, `SESSION_SECRET` (secreto largo aleatorio), `ADMIN_USERNAME` y `ADMIN_PASSWORD`.
6. Agrega un disco persistente y monta la ruta `/opt/render/project/src/data` (ajusta la ruta si Render muestra otra raíz). La base SQLite se guarda en `data/`; sin disco persistente los registros podrían perderse al reiniciar o desplegar.
7. Activa HTTPS y prueba registro, inicio de sesión, asignación de rutina y descarga de Excel.
8. Comparte la URL pública que Render te asigne. Cada cambio guardado desde el panel se verá al recargar la página pública.

La publicación requiere crear las cuentas de GitHub/hosting y confirmar sus condiciones y costos. No subas credenciales al repositorio.

## Cómo administrar
- Entra a **Acceso** con la cuenta de administrador.
- **Clientes**: consulta registros, abre cada ficha, asigna rutinas, manda mensajes y restablece contraseñas.
- **Página y pagos**: edita mensualidad, inscripción, horarios, contacto, Instagram y cuenta de pago. La cuenta de pago no se publica al cliente.
- **Promociones**: agrega promociones para mostrarlas en la portada.
- **Entrenadores**: registra nombre, especialidad, horario y contacto.
- **Descargar Excel**: exporta hojas de Clientes, Rutinas y Mensajes.

## Usuarios y seguridad
- Al registrarse, el sistema genera un usuario y contraseña aleatorios. La contraseña se muestra una sola vez al cliente; el administrador puede restablecerla y entregar la nueva contraseña.
- Las contraseñas se guardan cifradas mediante hash; no se pueden consultar en texto legible. Esto protege las cuentas.
- El Excel incluye datos de contacto. Descárgalo y guárdalo en un lugar privado; limita el acceso a personal autorizado.
- Para un uso comercial real, configura correo de recuperación, copias de seguridad, aviso de privacidad y revisión de seguridad antes de recopilar datos de clientes.
- Esta versión utiliza SQLite y sesiones persistentes en disco. Para múltiples instancias/alto tráfico conviene migrar a PostgreSQL y almacenamiento de sesiones administrado.
