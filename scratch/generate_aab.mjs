import fs from 'fs';
import path from 'path';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const keystorePath = 'C:\\Users\\Nacho\\OneDrive\\Desktop\\PROYECTO APP DE FLASCARDS CLAVES\\Flashmente - Google Play package 1.0.1\\signing.keystore';
  if (!fs.existsSync(keystorePath)) {
    throw new Error(`Keystore not found at ${keystorePath}`);
  }
  const keystoreBuffer = fs.readFileSync(keystorePath);
  const keystoreBase64 = `data:application/octet-stream;base64,${keystoreBuffer.toString('base64')}`;

  const payload = {
    appVersion: '1.0.2',
    appVersionCode: 3,
    backgroundColor: '#ffffff',
    display: 'standalone',
    enableNotifications: true,
    enableSiteSettingsShortcut: true,
    fallbackType: 'customtabs',
    features: {
      locationDelegation: { enabled: false },
      playBilling: { enabled: false }
    },
    host: 'flashmente.com',
    iconUrl: 'https://flashmente.com/icons/android-chrome-512x512.png',
    includeSourceCode: false,
    isChromeOSOnly: false,
    isMetaQuest: false,
    launcherName: 'Flashmente',
    maskableIconUrl: 'https://flashmente.com/icons/android-chrome-512x512.png',
    monochromeIconUrl: null,
    name: 'Flashmente',
    navigationColor: '#ffffff',
    navigationColorDark: '#000000',
    navigationDividerColor: '#ffffff',
    navigationDividerColorDark: '#000000',
    orientation: 'portrait-primary',
    packageId: 'com.flashmente.app',
    pwaUrl: 'https://flashmente.com',
    shortcuts: [],
    signing: {
      file: keystoreBase64,
      alias: 'flashmente-key',
      keyPassword: 'DbIbvnfxT5M9',
      storePassword: 'DbIbvnfxT5M9',
      fullName: null,
      organization: null,
      organizationalUnit: null,
      countryCode: null
    },
    signingMode: 'mine',
    splashScreenFadeOutDuration: 300,
    startUrl: '/',
    themeColor: '#FFD700',
    themeColorDark: '#000000',
    webManifestUrl: 'https://flashmente.com/manifest.json',
    minSdkVersion: 24
  };

  console.log('--- Iniciando compilación de Android App Bundle (.aab) ---');
  console.log('Versión:', payload.appVersion, '| VersionCode:', payload.appVersionCode);
  console.log('Enviando solicitud de empaquetado a PWABuilder Cloud APK Service...');

  const res = await fetch('https://pwabuilder-cloudapk.azurewebsites.net/enqueuePackageJob', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'platform-identifier': 'pwa-builder',
      'platform-identifier-version': '3.0.0'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Error en el servicio (${res.status} ${res.statusText}):`, text);
    process.exit(1);
  }

  const receipt = await res.json();
  console.log('Trabajo encolado exitosamente.');
  console.log('Job ID:', receipt.id);

  const jobId = receipt.id;
  const accessToken = receipt.accessToken;

  // Sondeo del estado del job
  for (let i = 0; i < 45; i++) {
    await sleep(4000);
    const jobRes = await fetch(`https://pwabuilder-cloudapk.azurewebsites.net/getPackageJob?id=${encodeURIComponent(jobId)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!jobRes.ok) {
      console.warn(`[Intento ${i + 1}] Error temporal al consultar estado:`, jobRes.status);
      continue;
    }

    const job = await jobRes.json();
    console.log(`[Intento ${i + 1}] Estado de compilación: ${job.status}`);

    if (job.status === 'Completed') {
      console.log('¡Compilación completada con éxito! Descargando paquete...');
      const downloadRes = await fetch(`https://pwabuilder-cloudapk.azurewebsites.net/downloadPackageZip?id=${encodeURIComponent(jobId)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!downloadRes.ok) {
        console.error('Error al descargar el archivo ZIP:', await downloadRes.text());
        process.exit(1);
      }

      const arrayBuffer = await downloadRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const outputDir = 'C:\\Users\\Nacho\\OneDrive\\Desktop\\PROYECTO APP DE FLASCARDS CLAVES\\Flashmente - Google Play package 1.0.2';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const zipPath = path.join(outputDir, 'Flashmente - Google Play package.zip');
      fs.writeFileSync(zipPath, buffer);
      console.log(`Paquete ZIP guardado en: ${zipPath} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`);

      console.log('Descomprimiendo archivos y preparando .aab definitivo en el Escritorio...');
      const { execSync } = await import('child_process');
      const pyExtractor = path.join(outputDir, 'extract.py');
      fs.writeFileSync(pyExtractor, `
import zipfile, shutil, os

zpath = r"${zipPath}"
out = r"${outputDir}"

with zipfile.ZipFile(zpath, 'r') as zip_ref:
    zip_ref.extractall(out)

src = os.path.join(out, 'Flashmente.aab')
dst1 = r"C:\\Users\\Nacho\\OneDrive\\Desktop\\Flashmente-1.0.2.aab"
dst2 = r"C:\\Users\\Nacho\\OneDrive\\Desktop\\Flashmente.aab"
shutil.copyfile(src, dst1)
shutil.copyfile(src, dst2)

print("Archivos extraídos:", os.listdir(out))
print("Copia a Desktop completada:", os.path.exists(dst1), f"{os.path.getsize(dst1) / (1024*1024):.2f} MB")
`);
      execSync(`python "${pyExtractor}"`, { stdio: 'inherit' });
      if (fs.existsSync(pyExtractor)) fs.unlinkSync(pyExtractor);
      return;
    } else if (job.status === 'Failed') {
      console.error('La compilación falló:', job.errors, job.logs);
      process.exit(1);
    }
  }

  console.error('Tiempo de espera agotado para la compilación.');
  process.exit(1);
}

main().catch(console.error);
