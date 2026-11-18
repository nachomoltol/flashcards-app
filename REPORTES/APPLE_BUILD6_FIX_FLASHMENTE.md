# INFORME TÉCNICO DE RESOLUCIÓN: APPLE BUILD 6 (FLASHMENTE iOS)

**Fecha:** 18 de Noviembre de 2026  
**Aplicación:** Flashmente (iOS)  
**Bundle ID:** `com.flashmente.app`  
**Versión de Marketing:** `1.0`  
**Versión de Compilación (Build):** `6` (Incrementado desde Build 5)  
**Estado de Verificación:** 0 Errores (`npx tsc --noEmit` & `npx eslint src/ --quiet`)

---

## 1. RESUMEN DEL PROBLEMA Y DIAGNÓSTICO (BUILD 5)

Durante la revisión en App Store de la Build 5, Apple reportó dos incidencias bloqueantes:

1. **Crashlog TCC (`EXC_CRASH` / `SIGKILL` al pulsar "Take Photo"):**
   - **Causa:** Al pulsar "Take Photo" en la pantalla de creación de Atlas Visuales (`/decks/atlas/new`), el sistema operativo iOS cerró de forma forzada la aplicación debido a que los textos descriptivos de uso de cámara y fototeca en `Info.plist` no cumplían con la descripción explícita del propósito del uso en la aplicación (Atlas visuales y generación de tarjetas con IA) o estaban desalineados.
2. **Guideline 2.1 - App Tracking Transparency (ATT):**
   - **Causa:** El binario enlaza el framework `AppTrackingTransparency` a través de `@capacitor-community/admob`, pero la solicitud nativa de autorización (`ATTrackingManager.requestTrackingAuthorization`) no se presentaba de forma temprana al usuario en el arranque de la app, antes de inicializar o cargar anuncios de AdMob.

---

## 2. CAMBIOS APLICADOS Y BLINDAJE TÉCNICO

### A. Blindaje de `ios/App/App/Info.plist`
Se actualizaron y consolidaron las claves requeridas por Apple en `ios/App/App/Info.plist`, verificando mediante el analizador binario de `plistlib` que el archivo es XML estricto y sin claves duplicadas:

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-8525131609099761~2585379190</string>

<key>NSUserTrackingUsageDescription</key>
<string>Usamos este identificador para ofrecer anuncios personalizados y adaptados a tus temas de estudio.</string>

<key>NSCameraUsageDescription</key>
<string>Flashmente necesita acceso a la cámara para fotografiar tus apuntes, libros o esquemas y convertirlos automáticamente en tarjetas de estudio o atlas visuales.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Flashmente necesita acceso a tu galería de fotos para seleccionar imágenes de tus apuntes y crear tarjetas de estudio o atlas visuales.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Flashmente necesita permiso para guardar imágenes y tarjetas generadas en tu galería.</string>
```

### B. Disparo Obligatorio de ATT en el Arranque Nativo (`src/lib/admob.ts` y Componentes Raíz)
1. **Detección y Carga Asíncrona Resiliente:** En `src/lib/admob.ts`, se implementó `getAdMobPlugin()` con soporte de importación dinámica fallback en caso de retardo de inyección del puente nativo de Capacitor.
2. **Solicitud de ATT Pre-Inicialización:** `requestIOSTrackingAuthorization` consulta primero `plugin.trackingAuthorizationStatus()`. Si el estado es `'notDetermined'`, invoca `plugin.requestTrackingAuthorization()`, mostrando el diálogo nativo oficial de Apple antes de inicializar el SDK de Google Mobile Ads o precargar cualquier bloque de anuncio.
3. **Temporización Segura (~600ms):** Se creó la función `initAdMobWithATT(delayMs = 600)`, la cual espera a que la ventana principal y el `SafeAreaBridgeViewController` de iOS estén completamente montados y en estado activo antes de presentar el modal nativo de permisos.
4. **Montaje Universal en `src/components/native/NativeAppInit.tsx` y `src/app/layout.tsx`:** Se añadió el componente de inicialización nativa en el layout raíz de la aplicación, ejecutándose automáticamente en el primer frame de cualquier ruta de entrada (`/`, `/login`, `/decks`), complementado además con el hook en `src/app/(dashboard)/layout.tsx`.

### C. Verificación de Ciclo de Vida iOS (`AppDelegate.swift` y `SceneDelegate.swift`)
- Se verificó que `SafeAreaBridgeViewController` y `SceneDelegate.swift` montan correctamente el `CAPBridgeViewController` y activan la ventana (`appWindow.makeKeyAndVisible()`) sin bloquear `applicationDidBecomeActive`.

### D. Incremento de Versión a Build 6
En `ios/App/App.xcodeproj/project.pbxproj`:
- `CURRENT_PROJECT_VERSION = 6;` (actualizado en todas las configuraciones Release y Debug).
- `MARKETING_VERSION = 1.0;` (mantenido).

### E. Sincronización Capacitor
Se ejecutó satisfactoriamente `npx cap sync ios`, detectando e integrando los plugins nativos:
- `@capacitor-community/admob@8.3.0`
- `@capacitor/camera@8.2.6`
- `@capacitor/device@8.0.3`
- `@capacitor/local-notifications@8.3.1`

---

## 3. CONTROL DE CALIDAD Y PRUEBAS

- **TypeScript (`npx tsc --noEmit`):** 0 errores.
- **ESLint (`npx eslint src/ --quiet`):** 0 errores.
- **Validación Plist (`plistlib`):** Formato XML validado correctamente.

---

## 4. ARCHIVOS MODIFICADOS Y CREADOS

- `ios/App/App/Info.plist`: Permisos exactos de cámara, fototeca, ATT y AdMob ID.
- `ios/App/App.xcodeproj/project.pbxproj`: `CURRENT_PROJECT_VERSION = 6`.
- `ios/App/CapApp-SPM/Package.swift`: Sincronización de plugins Capacitor en Swift Package Manager.
- `src/lib/admob.ts`: Métodos `getAdMobPlugin()`, `initAdMobWithATT()`, y exportación de `requestIOSTrackingAuthorization()`.
- `src/components/native/NativeAppInit.tsx`: Componente cliente que dispara ATT tras 600ms de montaje en iOS.
- `src/app/layout.tsx`: Inclusión de `<NativeAppInit />`.
- `src/app/(dashboard)/layout.tsx`: Refuerzo de llamada a `initAdMobWithATT(600)`.
