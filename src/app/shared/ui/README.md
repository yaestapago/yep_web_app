# UI components

Componentes visuales reutilizables de la plataforma Yep.

## Convencion

- El nombre del componente se mantiene limpio: `Button`, `Input`, `Alert`.
- El selector publico usa el prefijo de la plataforma: `yep-button`, `yep-input`, `yep-alert`.
- Los componentes UI viven en `src/app/shared/ui`.
- Las pantallas deben usar estos componentes para comportamiento y estados repetidos.
- Los estilos de cada pagina deben enfocarse en layout y composicion.
- Color, espaciado, radio, sombra, tipografia y motion deben salir de tokens globales en `src/styles.scss`.

## Fundaciones actuales

La paleta de Yep se mantiene en los tokens `--color-*`. Encima de esa paleta existen tokens de sistema para construir UI consistente:

- Espaciado: `--space-1` a `--space-10`, basado en pasos de 4/8px.
- Radius: `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-full`.
- Tipografia: `--font-size-*`, `--font-weight-*`, `--line-height-*`.
- Sombras: `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`.
- Controles: `--control-height-sm`, `--control-height-md`, `--control-height-lg`.
- Motion: `--motion-fast`, `--motion-base`, `--motion-slow`.

Regla practica: si un componente necesita un valor visual repetible, primero busca un token. Si no existe, agrega el token antes de hardcodear el valor.

## Componentes iniciales

- `Button`: acciones primarias, secundarias, ghost y danger.
- `Input`: campo base compatible con formularios reactivos.
- `Alert`: mensajes informativos, exito, advertencia y error.
- `OtpInput`: codigo de 6 digitos compatible con formularios reactivos, paste/autofill y reenvio.
