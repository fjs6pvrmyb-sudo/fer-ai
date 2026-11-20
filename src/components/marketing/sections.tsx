import Link from "next/link";
import { Brand, Icon, type IconName } from "@/components/icon";

const features: { title: string; text: string; icon: IconName }[] = [
  {
    title: "Ventas y cobros",
    text: "Registrá pagos parciales o divididos y consultá cuánto queda por cobrar.",
    icon: "receipt",
  },
  {
    title: "Jornadas y conciliación",
    text: "Revisá los cobros del día y contrastalos con sus referencias documentales.",
    icon: "wallet",
  },
  {
    title: "Indicadores gerenciales",
    text: "Consultá ventas, cobros y saldos por período en el dashboard de tu empresa.",
    icon: "trend",
  },
];

const steps = [
  ["Describí la venta", "Ingresá productos, cantidades y lo que te pagaron."],
  [
    "Revisá el borrador",
    "FER usa tu catálogo y el sistema verifica los importes.",
  ],
  [
    "Confirmá el registro",
    "Guardá la venta y abrí su detalle desde el historial.",
  ],
];

const industries = [
  [
    "Panaderías y cafeterías",
    "Registrá ventas de mostrador y revisá los cobros de la jornada.",
  ],
  [
    "Comercio minorista",
    "Organizá el catálogo, el historial de ventas y los saldos por cobrar.",
  ],
  [
    "Negocios de servicios",
    "Configurá tu catálogo de servicios y consultá los resultados por período.",
  ],
];

const questions = [
  [
    "¿A quién está dirigido FER AI?",
    "A pequeñas empresas que necesitan registrar ventas y pagos y consultar su operación en un solo lugar.",
  ],
  [
    "¿FER puede confirmar una venta por su cuenta?",
    "El asistente prepara el borrador. Una persona autorizada revisa y confirma la venta.",
  ],
  [
    "¿Qué sucede si solo me pagan una parte?",
    "Podés registrar el pago recibido y consultar el saldo pendiente en el detalle. Los cobros posteriores quedan asociados a la misma venta.",
  ],
  [
    "¿Puedo trabajar con más de una empresa?",
    "Sí. Después de iniciar sesión, elegís entre las empresas a las que tu cuenta tiene acceso.",
  ],
];

export function ProblemSection() {
  return (
    <section id="problema" className="marketing-brief">
      <div className="marketing-shell marketing-split">
        <h2>Cuando las ventas quedan repartidas, cerrar el día cuesta más.</h2>
        <p>
          Mensajes, pagos y apuntes sueltos dificultan saber cuánto vendiste,
          cuánto cobraste y qué falta revisar.
        </p>
      </div>
    </section>
  );
}

export function SolutionSection() {
  return (
    <div className="marketing-section-copy">
      <h2>Una gestión con los números a la vista</h2>
      <p>
        FER AI reúne las operaciones de tu empresa, desde el registro de la
        venta hasta el cierre de la jornada.
      </p>
    </div>
  );
}

export function Features() {
  return (
    <section id="solucion" className="marketing-section">
      <div className="marketing-shell">
        <SolutionSection />
        <div className="marketing-cards">
          {features.map(({ title, text, icon }) => (
            <article key={title} className="surface marketing-card">
              <span className="marketing-icon">
                <Icon name={icon} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="como-funciona" className="marketing-section">
      <div className="marketing-shell">
        <div className="marketing-section-copy">
          <h2>Cómo funciona</h2>
        </div>
        <ol className="marketing-cards marketing-steps">
          {steps.map(([title, text], index) => (
            <li key={title} className="marketing-card">
              <span className="marketing-icon" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Industries() {
  return (
    <section id="sectores" className="marketing-section marketing-industries">
      <div className="marketing-shell">
        <div className="marketing-section-copy">
          <h2>Para negocios que atienden de cerca</h2>
        </div>
        <div className="marketing-cards">
          {industries.map(([title, text]) => (
            <article key={title} className="surface marketing-card">
              <Icon name="shop" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Security() {
  return (
    <section id="seguridad" className="marketing-section">
      <div className="marketing-shell">
        <div className="marketing-security marketing-split">
          <div className="marketing-section-copy">
            <Icon name="shield" size={29} />
            <h2>Tu equipo mantiene el control</h2>
          </div>
          <ul>
            <li>Los permisos se comprueban por persona y empresa.</li>
            <li>
              El sistema calcula los importes y conserva los precios históricos.
            </li>
            <li>
              La conciliación distingue un pago informado de su verificación
              documental.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="marketing-section marketing-faq">
      <div className="marketing-shell marketing-split">
        <div className="marketing-section-copy">
          <h2>Preguntas frecuentes</h2>
        </div>
        <div className="marketing-questions">
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function EarlyAccess() {
  return (
    <section id="espera" className="marketing-section">
      <div className="marketing-shell">
        <div className="marketing-early marketing-split">
          <div className="marketing-section-copy">
            <h2>Acceso temprano</h2>
            <p>
              La lista de espera aún está cerrada. Podés recorrer la
              demostración o ingresar si ya tenés una cuenta.
            </p>
          </div>
          <div className="marketing-actions">
            <a className="button secondary" href="#demostracion">
              Ver ejemplo
            </a>
            <Link className="button primary" href="/acceso">
              Ingresar con mi cuenta
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-shell marketing-footer-inner">
        <Link href="/" aria-label="FER AI, inicio">
          <Brand />
        </Link>
        <nav aria-label="Accesos de FER AI">
          <Link href="/empresa">Acceso para empresas</Link>
          <Link href="/colaborador">Acceso para colaboradores</Link>
        </nav>
      </div>
    </footer>
  );
}
