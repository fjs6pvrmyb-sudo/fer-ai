"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Brand, Icon } from "@/components/icon";

const links = [
  { href: "#demostracion", label: "Demostración" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#seguridad", label: "Seguridad" },
  { href: "#faq", label: "Preguntas" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <header
      className="marketing-header"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <div className="marketing-shell marketing-header-inner">
        <Link href="/" className="marketing-home" aria-label="FER AI, inicio">
          <Brand />
        </Link>
        <button
          ref={trigger}
          type="button"
          className="button secondary marketing-menu-button"
          aria-controls="marketing-navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name="menu" size={18} /> Menú
        </button>
        <nav
          id="marketing-navigation"
          className={
            open ? "marketing-navigation is-open" : "marketing-navigation"
          }
          aria-label="Navegación comercial"
        >
          {links.map(({ href, label }) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
        </nav>
        <Link className="button primary marketing-access" href="/acceso">
          Iniciar sesión <Icon name="arrow" size={16} />
        </Link>
      </div>
    </header>
  );
}
