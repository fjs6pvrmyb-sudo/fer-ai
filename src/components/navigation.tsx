"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Icon, type IconName } from "./icon";

export function Navigation({
  org,
  operations,
}: {
  org: string;
  operations: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const base = `/empresas/${org}`;
  const sections: { href: string; label: string; icon: IconName }[] = [
    { href: base, label: "Inicio", icon: "grid" },
    { href: `${base}/catalogo`, label: "Catálogo", icon: "box" },
    { href: `${base}/ventas`, label: "Ventas", icon: "receipt" },
    { href: `${base}/configuracion`, label: "Configuración", icon: "settings" },
  ];
  if (operations) {
    sections.splice(
      3,
      0,
      { href: `${base}/intelligence`, label: "Preguntale a FER", icon: "chat" },
      { href: `${base}/jornadas`, label: "Jornadas", icon: "receipt" },
      { href: `${base}/conciliacion`, label: "Conciliación", icon: "wallet" },
    );
  }
  return (
    <div
      className="workspace-navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          menu.current?.focus();
        }
      }}
    >
      <button
        ref={menu}
        type="button"
        className="button mobile-menu"
        aria-controls="workspace-links"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="menu" /> Menú
      </button>
      <nav
        id="workspace-links"
        aria-label="Navegación principal"
        className={open ? "nav-links is-open" : "nav-links"}
      >
        {sections.map(({ href, label, icon }) => {
          const current =
            path === href || (href !== base && path.startsWith(href + "/"));
          return (
            <Link
              key={href}
              href={href}
              aria-current={
                current ? (path === href ? "page" : "location") : undefined
              }
              onClick={() => setOpen(false)}
            >
              <Icon name={icon} size={19} /> {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
