Crea una aplicación Angular 21 desde cero para un dashboard llamado
yep_web (ya estamos conectados al repo carpeta actual)

Requisitos técnicos:

- Usar Angular standalone components.
- Usar routing.
- Usar SCSS.
- tener light mode por default y dark mode
- responsive para mobile y desktop
- buenas practicas de programacion para angular
- No usar SSR por ahora.
- Crear una arquitectura por carpetas:
  - core
  - shared
  - features/auth
  - features/dashboard
  - features/notifications

Objetivo funcional:

- Crear pantalla /register con formulario:
  - accountName
  - firstName
  - lastName
  - email
  - password
  - phone-number

- Conectar el formulario con POST {API_URL}/auth/register.
- Crear pantalla /login con formulario:
  - email
  - password
- Conectar con POST {API_URL}/auth/login.
- Guardar accessToken y user en localStorage.
- Crear un AuthSessionService para manejar sesión.
- Crear un AuthInterceptor que agregue Authorization: Bearer <token>.
- Crear un AuthGuard que proteja /dashboard.
- Crear pantalla /dashboard.
- En /dashboard crear un listado de notificaciones para ver las notificaciones que llegan
- Mostrar respuesta exitosa o error del backend.

Buenas prácticas:

- Separar modelos/interfaces en shared/models.
- Separar servicios HTTP por feature.
- No dejar lógica HTTP dentro de componentes.
- Manejar loading y error state en formularios.
- Usar Reactive Forms.
- Usar HttpClient con provideHttpClient.
- Usar environments para configurar API_URL.
- Crear archivos listos para deploy en AWS Amplify Hosting.

Mi recomendación de orden

Hazlo en este orden:

1. Crear proyecto Angular 21
2. Subirlo a repo GitHub
3. Crear environments con apiUrl
4. Crear AuthApiService
5. Crear RegisterPage
6. Crear LoginPage
7. Crear AuthSessionService
8. Crear AuthInterceptor
9. Crear AuthGuard
10. Crear DashboardPage
11. Probar local contra Elastic Beanstalk
12. Conectar repo a Amplify
13. Configurar build
14. Probar frontend público

para los servicios de llamado a la api, podemos consultar los contratos de los endpoints existentes en @apiContracts.md

para la paleta de colores lee @colors.md
