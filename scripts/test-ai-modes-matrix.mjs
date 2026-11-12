import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

// Cargar variables de entorno desde .env.local sin dependencias externas
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("ERROR: GEMINI_API_KEY no encontrada en .env.local");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Directivas pedagógicas esenciales para la prueba
const ZERO_MISMATCH_DIRECTIVE = `Obligatorio: Cada justificación debe terminar con 'VEREDICTO_EXACTO: [texto idéntico a la opción correcta]'.`;
const PRACTICAL_MODE_DIRECTIVE = `ESTRUCTURA OBLIGATORIA DEL ENUNCIADO: [Contexto/Caso Operativo] + [Conflicto/Restricción Técnica] + [Pregunta de Decisión/Intervención]. Erradica preguntas memorísticas puras.`;

const testCases = [
  {
    id: "TEST-01",
    subject: "Ciencias Naturales (Primaria)",
    level: "9-11_years",
    pedagogicalMode: "didactic",
    isPractical: false,
    format: "multiple_choice",
    text: "Las plantas son seres vivos que fabrican su propio alimento mediante la fotosíntesis. Para realizarla necesitan agua del suelo, dióxido de carbono del aire y la luz del sol que captan a través de la clorofila, que es una sustancia verde presente en las hojas. Durante este proceso expulsan oxígeno al aire.",
    promptInstruction: "Genera 1 tarjeta didáctica tipo test adaptada estrictamente para niños de 9 a 11 años. Vocabulario directo, sin tecnicismos universitarios. 4 opciones balanceadas."
  },
  {
    id: "TEST-02",
    subject: "Historia (Secundaria ESO)",
    level: "12-14_years",
    pedagogicalMode: "academic",
    isPractical: true,
    format: "multiple_choice",
    text: "En el año 44 a.C., Julio César acumulaba poderes dictatoriales en Roma, lo que provocó una conspiración de senadores liderados por Bruto y Casio. Argumentaban la defensa de la República romana frente a la amenaza de una monarquía absoluta. Tras su asesinato en los Idus de marzo, en vez de restaurarse la paz republicana, estalló una nueva guerra civil que concluyó con el ascenso de Octavio Augusto como primer emperador.",
    promptInstruction: `${PRACTICAL_MODE_DIRECTIVE}\nGenera 1 tarjeta en Modo Práctico/Situacional (Contexto + Conflicto + Decisión) sobre el dilema político de los senadores romanos o sus consecuencias directas. Formato test 4 opciones.`
  },
  {
    id: "TEST-03",
    subject: "Física y Química (Bachillerato)",
    level: "15-17_years",
    pedagogicalMode: "didactic",
    isPractical: false,
    format: "cloze",
    text: "La ley de Boyle-Mariotte establece que, a temperatura constante, el volumen ocupado por una masa determinada de gas es inversamente proporcional a la presión que soporta (P1·V1 = P2·V2). Si la presión se duplica, el volumen se reduce a la mitad siempre que el sistema permanezca en condiciones isotérmicas.",
    promptInstruction: "Genera 1 tarjeta en formato CLOZE (texto con huecos). Utiliza corchetes [...] o {{c1::...}} para ocultar exactamente los términos técnicos clave o la relación matemática proporcional. Rigor formal de bachillerato."
  },
  {
    id: "TEST-04",
    subject: "Farmacología y Clínica (Universidad / Oposiciones)",
    level: "university_plus",
    pedagogicalMode: "didactic",
    isPractical: true,
    format: "open_cases",
    text: "Paciente de 68 años con hipertensión arterial crónica e insuficiencia cardíaca con fracción de eyección reducida. En analítica de control presenta potasio sérico de 5.6 mEq/L y filtrado glomerular de 28 mL/min. Actualmente en tratamiento con Enalapril 20 mg/día y Espironolactona 25 mg/día. Consulta por astenia y bradicardia leve.",
    promptInstruction: `${PRACTICAL_MODE_DIRECTIVE}\nFORMATO OPEN_CASES: Devuelve un objeto JSON con 'front' (el caso clínico estructurado con antecedentes, analítica y pregunta de ajuste terapéutico) y 'back' (la 'Respuesta Modelo' razonada farmacológicamente + una 'Rúbrica de Corrección Docente' con criterios específicos de puntuación y penalizaciones).`
  }
];

async function runTests() {
  console.log("Iniciando batería de pruebas con Google Gemini (" + modelName + ")...\\n");
  let reportOutput = "# INFORME DE PRUEBAS DE ESTRÉS: MODOS Y ASIGNATURAS IA\\n\\n";
  reportOutput += "**Fecha de Ejecución:** " + new Date().toISOString() + "\\n";
  reportOutput += "**Modelo Evaluado:** " + modelName + "\\n\\n---\\n\\n";

  for (const tc of testCases) {
    console.log("Ejecutando " + tc.id + " [" + tc.subject + "]...");
    const systemPrompt = "Eres el motor de evaluación pedagógica de Flashmente. Cumple rigurosamente el formato solicitado.\\n" +
      tc.promptInstruction + "\\n" + ZERO_MISMATCH_DIRECTIVE;

    const userPrompt = "TEXTO BASE FUENTE:\\n" + tc.text;

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + "\\n\\n" + userPrompt }] }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const rawText = response.text;
      reportOutput += "## " + tc.id + ": " + tc.subject + " (" + tc.level + ")\\n";
      reportOutput += "- **Modo Pedagógico:** `" + tc.pedagogicalMode + "`\\n";
      reportOutput += "- **Enfoque Práctico:** `" + (tc.isPractical ? "SÍ" : "NO") + "`\\n";
      reportOutput += "- **Formato:** `" + tc.format + "`\\n\\n";
      reportOutput += "### Respuesta Generada por la IA:\\n```json\\n" + rawText + "\\n```\\n\\n---\\n\\n";
    } catch (err) {
      console.error("Error en " + tc.id + ":", err.message);
      reportOutput += "## " + tc.id + ": " + tc.subject + " -> ERROR\\n" + err.message + "\\n\\n---\\n\\n";
    }
  }

  const reportsDir = "C:\\Users\\Nacho\\OneDrive\\Desktop\\REPORTES";
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `RESULTADOS_PRUEBAS_ASIGNATURAS_${nowIso}.md`;
  const fullPath = path.join(reportsDir, fileName);

  fs.writeFileSync(fullPath, reportOutput, 'utf8');
  console.log("\\nBatería completada con éxito. Informe guardado en:\\n" + fullPath);
  return fullPath;
}

runTests().then((p) => {
  console.log("TEST_REPORT_PATH=" + p);
}).catch((err) => {
  console.error("Fallo general:", err);
  process.exit(1);
});

