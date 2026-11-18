# INFORME TÉCNICO: RESTAURACIÓN DEL ICONO OFICIAL ILUSTRADO Y BUILD 7 (iOS)

**Fecha:** 18 de Noviembre de 2026  
**Aplicación:** Flashmente (iOS)  
**Bundle ID:** `com.flashmente.app`  
**Versión de Compilación (Build):** `7` (`CURRENT_PROJECT_VERSION = 7`, `MARKETING_VERSION = 1.0`)  
**Rama:** `feature/ios-build` y `main`  
**Control de Calidad:** 0 Errores (`npx tsc --noEmit` & `npx eslint src/ --quiet`)

---

## 1. PROCESAMIENTO ESTRICTO DE APP ICON PARA APP STORE

Se procesó la ilustración oficial de Flashmente (`AppIcon_1024.png` / `android-chrome-512x512.png`) utilizando el motor Sharp bajo los requerimientos estrictos de Apple App Store:

- **Dimensiones:** `1024 x 1024` píxeles exactos.
- **Formato:** PNG (`image/png`).
- **Espacio de Color:** sRGB IEC61966-2.1 (`space: srgb`).
- **Profundidad de Color:** 24-bit RGB (`channels: 3`).
- **Canal Alfa / Transparencia:** **Sin canal alfa** (`hasAlpha: false`).
- **Densidad:** 72 DPI (`density: 72`).
- **Destino:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`.
- **Validación Xcode:** `Contents.json` configurado correctamente apuntando a `AppIcon-512@2x.png` con tamaño universal `1024x1024`.
- **Verificación Git:** Comprobado con `git check-ignore` que el archivo no está ignorado en `.gitignore`.

---

## 2. PURGA PREVENTIVA DE ICONOS VIOLETAS ANTIGUOS

Se sobrescribieron todos los archivos heredados del icono violeta en la raíz y en `public/` con la ilustración oficial de Flashmente:
- `public/icons/icon-512x512.png` <- Ilustración oficial (`android-chrome-512x512.png`).
- `public/icons/icon-192x192.png` <- Ilustración oficial (`android-chrome-192x192.png`).
- `public/icon.png` <- Ilustración oficial (`android-chrome-512x512.png`).

---

## 3. VERIFICACIÓN DE PERMISOS TCC Y ATT

Se verificó que `ios/App/App/Info.plist` mantiene intactas y sin duplicados las 5 claves obligatorias:
- `NSCameraUsageDescription`: *"Flashmente necesita acceso a la cámara para fotografiar tus apuntes, libros o esquemas y convertirlos automáticamente en tarjetas de estudio o atlas visuales."*
- `NSPhotoLibraryUsageDescription`: *"Flashmente necesita acceso a tu galería de fotos para seleccionar imágenes de tus apuntes y crear tarjetas de estudio o atlas visuales."*
- `NSPhotoLibraryAddUsageDescription`: *"Flashmente necesita permiso para guardar imágenes y tarjetas generadas en tu galería."*
- `NSUserTrackingUsageDescription`: *"Usamos este identificador para ofrecer anuncios personalizados y adaptados a tus temas de estudio."*
- `GADApplicationIdentifier`: `ca-app-pub-8525131609099761~2585379190`.

---

## 4. INCREMENTO DE VERSIÓN Y DESPLIEGUE

- `CURRENT_PROJECT_VERSION` incrementado a **`7`** en `ios/App/App.xcodeproj/project.pbxproj`.
- Sincronización Capacitor completada con `npx cap sync ios`.
- Commit y push exitoso a `origin/main` y `origin/feature/ios-build`.
