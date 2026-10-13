# Componentes UI compartidos

Componentes visuales de la app web de YEP (`src/app/shared/ui/`). Las pantallas los usan para todo
comportamiento y estado repetido; el SCSS de cada pantalla solo hace layout y composición.

La fuente de verdad del diseño es [`docs/rediseno-web/`](../../../../../docs/rediseno-web/README.md):
[principios](../../../../../docs/rediseno-web/01-principios.md),
[tokens](../../../../../docs/rediseno-web/02-tokens.md) y
[especificación de componentes](../../../../../docs/rediseno-web/03-componentes.md).

> Estos enlaces son relativos al repo `local-dev-env` (donde `frontend/` es un submódulo) y solo
> funcionan dentro de esa copia. En el repo `yep_web_app` por separado (p. ej. en GitHub) no resuelven:
> busca `docs/rediseno-web/` en `local-dev-env`.

## Convención

- Clase limpia (`Button`, `Card`) y selector con prefijo: `yep-button`, `yep-card`. Excepciones de
  atributo: `a[yepButton]`, `table[yepTable]`, `[yepMenuItem]`.
- `standalone`, `input()`/`output()` con señales, sin servicios ni llamadas al API (salvo
  `NotificationModalService`).
- Cada carpeta: `<nombre>.ts`, `.html`, `.scss`, `.spec.ts`. Lo público se exporta en `index.ts`.
- API compatible: en un componente existente solo se **añaden** inputs opcionales cuyo valor por
  defecto reproduce el comportamiento actual. Se conservan selectores, outputs y `data-cy`.

## Reglas de uso

Resumen de P1–P10 ([01-principios.md](../../../../../docs/rediseno-web/01-principios.md)) aplicado a componentes:

1. **Una sola capa de caja (P1).** Página → `yep-card`. Nunca una tarjeta dentro de otra; para agrupar
   dentro usa `yep-card-section`, divisores o fondo `--color-surface-muted`. `yep-kpi`,
   `yep-check-group` y `yep-radio-selection-list` no son tarjetas propias.
2. **Datos en listas (P2).** Información de lectura con `yep-description-list` + `yep-description-item`
   dentro de una sola tarjeta. Prohibido "una caja por dato".
3. **Un primario por vista o modal (P3).** El resto `secondary` (borde tinta) o `ghost`. El FAB
   "Validar pago" del shell no cuenta.
4. **Destructivos (P3)** nunca rellenos en rojo dentro de una fila: van en `yep-menu` con
   `yepMenuItem tone="danger"`, o como `secondary`/`ghost` con `tone="danger"` en un modal, siempre con
   la confirmación que ya exista. Acciones de fila: `yep-icon-button` ghost (ver, editar, configurar);
   más de tres → `yep-menu`.
5. **Color con significado (P4).** Verde = acción/éxito; lima (`live`, banner `lime`) = un solo
   elemento por vista; ámbar = pendiente; rojo = error/eliminar.
6. **Iconos (P5):** solo Lucide (`@lucide/angular`), 16 px en botones/chips/filas, 20 px en cabeceras,
   24 px en estados vacíos. Contenedor de icono = `yep-icon-tile`.
7. **Plano (P6, P7).** Sin `box-shadow` salvo `--shadow-overlay` (menús, modales, FAB); sin degradados
   ni `filter`. Inputs con borde 1 px y foco de 1,5 px `--color-focus`, sin halo.
8. **Sin valores sueltos.** Ningún `*.scss` escribe colores literales (hex, `rgb()`, nombres), sombras
   ni `font-family`: todo sale de variables de
   [02-tokens.md](../../../../../docs/rediseno-web/02-tokens.md) (`--color-*`, `--space-*`, `--radius-*`,
   `--font-family-{base,display,mono}`, `--shadow-overlay`, `--chart-*`…). Si falta un token, se añade
   en `src/styles.scss` y en 02 antes de usarlo.
9. **Foco global.** `src/styles.scss` ya pinta `:focus-visible` (anillo 2 px `--color-focus`, offset
   2 px) e inputs. No dupliques anillos ni quites `outline` en componentes o pantallas.
10. **Ritmo (P8).** Escala `--space-*`; listados de más de 5 elementos con 3+ atributos → `yep-table`.
11. **Marca con medida (P9).** Display (Barlow Condensed) solo en `yep-page-header`, `yep-kpi`,
    `yep-banner` y cifras grandes; montos, referencias y horas en mono (`.num`, `[mono]`).
12. **Estados completos (P10).** Toda vista que carga datos usa `yep-state` para cargando (esqueleto),
    vacío y error; en tablas, dentro de una celda con `colspan`.

## Componentes

Exportados en `index.ts`. Inputs con su valor por defecto; `req` = obligatorio.

### Acciones

| Selector | Para qué | API principal | Nota |
| --- | --- | --- | --- |
| `yep-button` (`Button`) | Acción | `variant`: `primary`\|`secondary`\|`ghost`\|`danger` (`primary`) · `size`: `sm`\|`md`\|`lg` (`md`) · `tone`: `neutral`\|`danger`\|`on-brand`\|`ink` · `type`, `disabled`, `loading`, `fullWidth` · out `clicked: MouseEvent` · contenido proyectado (icono + texto) | `tone` `danger`/`on-brand` solo en `secondary`/`ghost`; `ink` también con `primary` (fondo `--brand-ink`), para fondos lima. Sin `aria-label` |
| `a[yepButton]` (`ButtonLink`) | Botón como enlace | `variant`, `size`, `tone` (incl. `ink`), `fullWidth` · la página pone `routerLink`/`href`/`target` | Sin `disabled` ni `loading`: si no aplica, no se muestra |
| `yep-icon-button` (`IconButton`) | Acción solo icono | `action`: `edit`\|`delete`\|`activate`\|`deactivate` (preset) **o** `[icon]` (clase Lucide, p. ej. `LucideX`) + `label` · `size` (`sm`) · `tone`: `neutral`\|`danger` · `loading`, `disabled` · out `clicked` | Con `icon`, `label` es obligatorio (va a `aria-label` y `title`). `delete` ya es `danger` |
| `yep-menu` + `[yepMenuItem]` (`Menu`, `MenuItem`) | Menú "Más" | Menú: `label` (`'Más acciones'`), `size`: `sm`\|`md`, `align`: `start`\|`end` (`end`), `disabled`, `dataCy` · out `openChange` · Ítem (sobre `<button>`/`<a>`): `tone`: `neutral`\|`danger` | Disparador `ellipsis` propio; `position: fixed` (no lo recortan tablas ni modales); teclado completo, Escape y clic fuera |

### Formularios

| Selector | Para qué | API principal | Nota |
| --- | --- | --- | --- |
| `yep-input` (`Input`) | Campo de texto | `label`, `type` (`text`, `email`, `password`, `number`, `search`, `tel`, `url`), `size` (`md`), `placeholder`, `hint`, `error`, `autocomplete`, `disabled`, `readonly`, `required`, `id` | Solo `ControlValueAccessor` (`formControlName`/`ngModel`); sin `value` ni output de cambio |
| `yep-select` (`Select`) | Desplegable | `options` (`SelectOption`/`SelectOptionGroup`), `label`, `placeholder`, `size`, `hint`, `error`, `multiple`, `searchable`, `clearable`, `showCountryFlags`, `highlightSelected`, `showPlaceholderAsLabel`, `embedded`, `disabled`, `required`, `dataCy` · out `selectionChange`, `cleared`, `searchChange`, `scrolledToEnd`, `enterKey` | `ControlValueAccessor`; sin `value` controlado ni icono configurable |
| `yep-phone-input` (`PhoneInput`) | Teléfono con país | `label`, `size`, `placeholder`, `hint`, `error`, `disabled`, `required`, `validateOnInit` · out `valueChange`, `countryCodeChange`, `phoneNumberChange`, `validChange` | CVA + validador |
| `yep-otp-input` (`OtpInput`) | Código de 6 dígitos | `engine`, `status`, `errorMessage`, `resendSeconds`, `disabled` · out `codeChanged`, `codeCompleted`, `resendRequested` | CVA + validador; pegar/autocompletar |
| `yep-address-location-select` (`AddressLocationSelect`) | Departamento + ciudad | `departmentLabel`, `cityLabel`, placeholders, `error`, `required`, `disabled`, `dataCy` · out `selectionChange` | CVA |
| `yep-radio-selection-list` (`RadioSelectionList`) | Opciones como filas-tarjeta | `options: RadioSelectionOption[]`, `typeLayout`: `default`\|`description`, `alwaysShowDescription`, `showFilter`, `filterPlaceholder`, `disabled`, `name` · out `valueChange`, `searchChange` | CVA. Seleccionada: borde verde y fondo `--color-primary-soft` |
| `yep-check-group` + `yep-check-option` | Casilla padre con hijas (cuentas/llaves) | Grupo: `label` req, `meta`, `count` (texto "2 de 2"), `checked`, `indeterminate`, `disabled`, `dataCy` · out `checkedChange` · slot `[slot=actions]` · Opción: `label` req, `meta`, `checked`, `disabled`, `dataCy` · out `checkedChange` | Sin borde (va dentro de tarjeta o modal) |
| `yep-file-drop` (`FileDrop`) | Subir archivo | `accept`, `multiple`, `label`, `buttonLabel`, `hint`, `files: FileDropItem[]`, `progress`, `error`, `disabled`, `allowDrop`, `removable` · out `fileChange: Event` (el `change` nativo), `removed: number` | Al soltar, asigna los archivos al input interno y despacha `change`: la página conserva su manejador. La validación sigue en la página |

`yep-checkbox`, `yep-radio`, `yep-toggle`, `yep-time-picker`, `yep-day-picker` y
`yep-date-range-picker` existen y están rediseñados, pero **no se exportan en `index.ts`**: se importan
desde su archivo (`shared/ui/checkbox/checkbox`, etc.).

| Selector | API principal |
| --- | --- |
| `yep-checkbox` | `checked`, `label`, `ariaLabel`, `appearance`: `box`\|`chip`, `error`, `disabled`, `dataCy`, `id` · out `checkedChange` · CVA |
| `yep-radio` | `name`, `value`, `checked`, `label`, `ariaLabel`, `disabled`, `dataCy` · out `selected` |
| `yep-toggle` | `pressed`, `label`, `ariaLabel`, `appearance`: `switch`\|`button`, `disabled`, `dataCy` · out `toggled` · slot `[toggleLead]` |
| `yep-time-picker` / `yep-day-picker` | CVA; `label`, `error`, `disabled`, `dataCy` (time) · `disabled` (day) |
| `yep-date-range-picker` | `range` req, `preset`: `today`\|`7d`\|`30d`\|`month`\|`custom` · out `rangeChange` |

### Estructura y datos

| Selector | Para qué | API principal | Nota |
| --- | --- | --- | --- |
| `yep-page-header` (`PageHeader`) | Encabezado de página | `title` req, `subtitle`, `eyebrow` · slots `[slot=back]`, `[slot=leading]`, `[slot=meta]`, `[slot=actions]` | En secciones de negocio lo pinta el shell: la sección no pone otro `h1` |
| `yep-card` (`Card`) | Tarjeta única (P1) | `title`, `subtitle`, `padding`: `md`\|`none`, `tone`: `default`\|`brand` · slots `[slot=icon]`, `[slot=actions]`, contenido, `[slot=footer]` | `brand`: fondo tinta, borde `--card-brand-border` (verde en oscuro). `none` para tablas a sangre |
| `yep-card-section` (`CardSection`) | Agrupar dentro de tarjeta | `title` | Divisor superior salvo la primera |
| `yep-description-list` + `yep-description-item` | Datos de lectura (P2) | Lista: `columns`: 1\|2\|3 (2), `layout`: `stacked`\|`inline` · Ítem: `label` req, `hint`, `mono`, `copy`, `span`: 1\|2\|3 · out `copied` | `copy` muestra el botón; la página copia en su handler. Celular: 1 columna |
| `table[yepTable]` (`Table`) | Tabla nativa con estilo | `density`: `comfortable`\|`compact`, `stackOnMobile` (`true`), `clickableRows` | Envolver en `div.yep-table-wrap`; celdas `.num` (derecha, mono) y `.actions`; `data-label` en cada `td` para el apilado ≤ 768 px |
| `yep-pagination` (`Pagination`) | "Página X de Y" | `page` req, `pageCount` req · out `pageChange: number` | Solo para pantallas que ya paginan |
| `yep-kpi` (`Kpi`) | Cifra destacada | `label` req, `value` req (ya formateado), `hint`, `tone`: `default`\|`success`\|`warning`\|`error`, `loading`, `emphasis`, `size`: `md`\|`sm` | `emphasis`: un solo KPI por vista. Sobre la página o dentro de una tarjeta, nunca en caja propia |
| `yep-status-chip` (`StatusChip`) | Estado o etiqueta | `label` req, `tone`: `success`\|`warning`\|`error`\|`info`\|`neutral`\|`live` (`neutral`), `dot` (`true`), `size`: `sm`\|`md` | `live` = lima: uno por vista |
| `yep-status-dot` (`StatusDot`) | Punto de estado de notificador | `level` req: `online`\|`delayed`\|`offline`\|`unknown`, `label`, `detail`, `compact`, `labelMuted` | Pulso de opacidad, sin halo |
| `yep-state` (`State`) | Cargando / vacío / error (P10) | `kind` req: `loading`\|`empty`\|`error`, `title`, `description`, `rows` (3) · slots `[slot=icon]`, `[slot=action]` | Icono por defecto `inbox` / `circle-alert` |
| `yep-segmented` (`Segmented`) | Alternar vistas o filtros | `options: {value, label, count?}[]` req, `value` req · out `valueChange` (`[(value)]`) | `role="tablist"`: pon `aria-label` en el host |
| `yep-avatar` (`Avatar`) | Iniciales | `name` req, `size`: 32\|40\|48 | Lima con tinta (no cuenta para P4) |
| `yep-icon-tile` (`IconTile`) | Contenedor de icono (P5) | `size`: 36\|48, `active` · icono proyectado | Activo = fondo `--color-primary-soft` |
| `yep-chart-canvas` (`ChartCanvas`) | Gráfica Chart.js | `type` req, `data` req, `options`, `ariaLabel` | Toma `--chart-1…4`, `--chart-grid`, `--chart-axis` y la fuente base como defectos y los relee al cambiar `data-theme`. No pases colores propios: lo de `data`/`options` gana |

### Mensajes y capas

| Selector | Para qué | API principal | Nota |
| --- | --- | --- | --- |
| `yep-alert` (`Alert`) | Aviso en línea | `variant`: `info`\|`success`\|`warning`\|`error` (`info`), `title`, `dismissible` · out `dismissed` · contenido proyectado | Fondo `-soft`, texto `-strong`, sin borde lateral |
| `yep-banner` (`Banner`) | Banner de marca (home) | `title` req, `eyebrow`, `text`, `tone`: `ink`\|`lime`\|`paper`, `imageSrc`, `size`: `md`\|`compact` · slots `[slot=actions]`, `[slot=icon]` | En `ink`, acciones `primary` + `secondary tone="on-brand"`; en `lime`, `tone="ink"`. Ilustración oculta si el banner mide < 640 px |
| `yep-modal` (`Modal`) | Diálogo | `open`, `title`, `subtitle`, `size`: `sm`\|`md`\|`lg`, `showHeader`, `loading`, `dismissOnBackdrop` · out `closeRequested` · pie con `<ng-container modalFooter>` | ≤ 768 px es hoja inferior. El cierre siempre lo decide el padre. No atrapa el foco |
| `yep-notification-modal` + `NotificationModalService` | Avisos y confirmaciones globales | Ya montado en `app.html`. Servicio: `info`, `success`, `warning`, `error`, `alert`, `confirm` (→ `Promise<boolean>`), `loading` (→ `{close, update}`) | No lo montes en pantallas; llama al servicio |

## Limitaciones conocidas y pedidos pendientes

Sacados del registro de decisiones y de la tabla de estado de
[05-plan-agentes.md](../../../../../docs/rediseno-web/05-plan-agentes.md). Mientras no se resuelvan,
las pantallas usan nativos con piel de tokens; no copies estilos de un componente en clases locales.

- `yep-button` / `a[yepButton]`: sin `aria-label` ni `aria-expanded`/`aria-haspopup` (el FAB "Validar
  pago" y los disparadores propios no los tienen).
- `yep-state`: sin tamaño grande (título 14 px) ni ilustraciones.
- `yep-segmented`: sin iconos y sin `disabled` por opción.
- `yep-kpi`: sin `tone="info"`.
- `yep-status-chip`: sin variante mono (códigos, referencias).
- `yep-select`: sin icono/chevron configurable.
- No existe `yep-textarea`.
- `yep-input` / `yep-select`: sin `value` controlado fuera de formularios reactivos (solo CVA).
- `yep-modal`: no atrapa el foco (sería lógica nueva).
- `yep-checkbox`, `yep-radio`, `yep-toggle` y los selectores de fecha/hora no están en `index.ts`.
- Objetivo táctil de 40 px en checkbox/radio/toggle sin aplicar.
