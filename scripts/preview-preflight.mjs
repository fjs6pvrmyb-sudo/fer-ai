// Gate de build para la preview privada: aborta si el entorno no es exactamente
// el aprobado (QA + clave publicable + IA demo) o si hay secretos presentes.
// Se ejecuta desde vercel.json antes de `next build`. No imprime valores.
const approvedUrl = "https://lqqeisjzoajtvwcifard.supabase.co";
const env = process.env;
const problems = [];

if (env.NEXT_PUBLIC_SUPABASE_URL !== approvedUrl)
  problems.push("NEXT_PUBLIC_SUPABASE_URL debe ser el proyecto QA aprobado.");
if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_"))
  problems.push(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY debe ser una clave publicable.",
  );
if (env.FER_INTELLIGENCE_MODE !== "demo")
  problems.push("FER_INTELLIGENCE_MODE debe ser demo.");

const forbidden = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "FERIA_QA_ADMIN_KEY",
  "FERIA_DEMO_PASSWORD",
  "OPENAI_API_KEY",
  "FER_INTELLIGENCE_MODEL",
  "GITHUB_TOKEN",
  "GH_TOKEN",
];
for (const name of forbidden)
  if (env[name]) problems.push(`${name} no debe existir en la preview.`);

// Ningún valor puede parecer una credencial privilegiada, con cualquier nombre.
const secretShapes = [
  /^sb_secret_/,
  /^sk-[A-Za-z0-9_-]{20,}/,
  /^gh[pousr]_[A-Za-z0-9]{20,}/,
  /^github_pat_/,
];
for (const [name, value] of Object.entries(env)) {
  if (!value || name.startsWith("VERCEL_")) continue;
  if (secretShapes.some((shape) => shape.test(value)))
    problems.push(`${name} contiene un valor con forma de secreto.`);
  if (
    name.startsWith("NEXT_PUBLIC_") &&
    /"role"\s*:\s*"service_role"/.test(
      (() => {
        try {
          return Buffer.from(value.split(".")[1] ?? "", "base64url").toString();
        } catch {
          return "";
        }
      })(),
    )
  )
    problems.push(`${name} contiene un JWT de service_role.`);
}

if (problems.length) {
  console.error("Preflight de preview: FAIL");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(
  "Preflight de preview: PASS (QA, clave publicable, IA demo, sin secretos)",
);
