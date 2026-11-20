"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "./icon";

export function Navigation({ org }: { org: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const base = `/empresas/${org}`;
  const sections: { href: string; label: string; icon: IconName }[] = [
    { href: base, label: "Inicio", icon: "grid" },
    { href: `${base}/catalogo`, label: "Catálogo", icon: "box" },
    { href: `${base}/ventas`, label: "Ventas", icon: "receipt" },
    { href: `${base}/configuracion`, label: "Configuración", icon: "settings" },
  ];
  return (
    <div className="workspace-navigation">
      <button
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
