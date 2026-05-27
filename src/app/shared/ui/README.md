# UI components

Componentes visuales reutilizables de la plataforma Yep.

## Convencion

- El nombre del componente se mantiene limpio: `Button`, `Input`, `Alert`.
- El selector publico usa el prefijo de la plataforma: `yep-button`, `yep-input`, `yep-alert`.
- Los componentes UI viven en `src/app/shared/ui`.
- Las pantallas deben usar estos componentes para comportamiento y estados repetidos.
- Los estilos de cada pagina deben enfocarse en layout y composicion.

## Componentes iniciales

- `Button`: acciones primarias, secundarias, ghost y danger.
- `Input`: campo base compatible con formularios reactivos.
- `Alert`: mensajes informativos, exito, advertencia y error.
