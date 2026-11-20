# FER AI — DESIGN SYSTEM & SPECIFICATION (design.md)
## Versión 1.0.0 · Dojo AI Hackathon 2026
**Responsables:** Antigravity (Frontend Lead & UX Architect) & Aaron (Web Lead)  
**Coordinación:** Fernando (Product Lead) & Codex (Core Architect)

---

### 1. Filosofía de Diseño

FER AI está diseñado para reducir al mínimo absoluto la carga cognitiva del pequeño empresario en Costa Rica.
El diseño no busca ser decorativo ni ostentoso; busca ser un instrumento de trabajo certero, veloz, confiable y profundamente respetuoso del tiempo del usuario.

Nuestra filosofía se sintetiza en la tríada operativa:
> **La IA interpreta. El sistema valida. El empresario confirma.**

- **Claridad sobre adorno:** Cada píxel, dato y color comunica un estado operativo real.
- **Inmutabilidad y seguridad visual:** Los datos contables y bancarios se presentan con absoluta jerarquía visual para que ninguna cifra sea ambigua.
- **Mobile-first en el mostrador, Desktop-first en la gerencia:** La interfaz se adapta al operario que cobra de pie en un teléfono celular y al dueño que analiza el flujo de caja en su laptop.

---

### 2. Personalidad de Marca

- **Profesional y sobrio:** Inspirado en la solidez del software financiero de grado corporativo, pero sin su frialdad ni burocracia.
- **Inteligente y anticipatorio:** Comunica asistencia activa y precisión analítica.
- **Cercano y adaptado al comercio tico:** Reconoce el vocabulario comercial diario (SINPE Móvil, casados, compras a granel, fiados, cierres de turno, abonos).
- **Tranquilizador:** Mitiga la ansiedad del cierre de caja y el desorden de los comprobantes digitales.

---

### 3. Identidad Visual

- **Nombre de Marca:** FER AI (con versión territorial *FER AI Costa Rica*).
- **Lema Oficial:** *«Tu negocio, más inteligente. Tu gestión, más sencilla.»*
- **Símbolo de Marca:** Monograma "F" estilizado en caja contenedora redondeada (`rounded-xl`), fondo verde menta (`#2DD4A7`) y glifo en azul profundo (`#0F2A5C`).
- **Insignia Territorial:** Pill badge con borde y fondo suave: `text-[10px] bg-[#2DD4A7]/20 text-[#2DD4A7] border border-[#2DD4A7]/40 px-1.5 py-0.5 rounded-full font-medium`.

---

### 4. Paleta Cromática

La paleta armoniza la solidez del azul marino corporativo con la frescura tecnológica del verde menta y la legibilidad de fondos neutros fríos:

| Rol de Color | Nombre Técnico | Hexadecimal | Uso Principal |
| :--- | :--- | :--- | :--- |
| **Primario Dominante** | Azul Profundo FER | `#0F2A5C` | Navbars, headers, hero, sidebar, botones primarios institucionales |
| **Acento Tecnológico** | Verde Menta FER | `#2DD4A7` | Indicadores de confirmación, badges activos, acentos de marca, glow |
| **Acento Secundario** | Azul Tecnológico Core | `#234EDC` | Acciones en Core, enlaces activos, foco accesible |
| **Fondo Base (Canvas)**| Slate Limpio | `#F8FAFC` | Fondo de página general, áreas de descanso visual |
| **Superficie** | Blanco Puro | `#FFFFFF` | Tarjetas, contenedores, modales, paneles |
| **Bordes & Separadores**| Línea Neutral | `#DFE5EE` / `#E2E8F0` | Bordes de tablas, divisores, inputs |
| **Texto Titular** | Tinta Profunda | `#0F172A` / `#142137` | Títulos principales (h1, h2, h3), cifras monetarias |
| **Texto Secundario** | Muted Slate | `#536279` / `#64748B` | Párrafos, metadatos, etiquetas secundarias |
| **Éxito (Validado)** | Emerald | `#10B981` / `#0A6655` | Estado «Pagada», SINPE verificado, comprobante confirmado |
| **Advertencia (Alerta)**| Ámbar | `#F59E0B` / `#80530C` | Estado «Pago parcial», saldo pendiente de cobro, revisión |
| **Peligro (Error)** | Rojo Carmín | `#EF4444` / `#DC2626` | Descuadre en arqueo, error de red, venta rechazada |

---

### 5. Tokens de Diseño (CSS Variables)

```css
:root {
  /* Colores Principales */
  --fer-navy: #0f2a5c;
  --fer-navy-dark: #0a1c3d;
  --fer-mint: #2dd4a7;
  --fer-mint-hover: #25be94;
  --fer-blue: #234edc;
  --fer-blue-dark: #1a3cb3;
  
  /* Superficies & Neutrales */
  --fer-bg: #f8fafc;
  --fer-surface: #ffffff;
  --fer-border: #dfe5ee;
  --fer-text: #0f172a;
  --fer-muted: #536279;

  /* Semántica */
  --fer-success: #0a6655;
  --fer-success-bg: #ecfdf5;
  --fer-warning: #80530c;
  --fer-warning-bg: #fffbeb;
  --fer-danger: #b91c1c;
  --fer-danger-bg: #fef2f2;

  /* Espaciado & Geometría */
  --fer-radius-sm: 8px;
  --fer-radius-md: 12px;
  --fer-radius-lg: 16px;
  --fer-radius-xl: 24px;
}
```

---

### 6. Tipografía

- **Familia Tipográfica:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `sans-serif`.
- **Cifras y Comprobantes:** Fuente de espaciado uniforme para números y códigos bancarios (`font-mono`, `font-feature-settings: "tnum"`).
- **Escala de Textos:**
  - `Hero Display`: 48px – 64px / Inter Extrabold (`font-extrabold tracking-tight`).
  - `H1 (Secciones)`: 30px – 36px / Inter Bold (`font-bold`).
  - `H2 (Tarjetas/Módulos)`: 20px – 24px / Inter Bold.
  - `H3 / Subtítulos`: 16px – 18px / Inter Semibold (`font-semibold`).
  - `Cuerpo de Texto`: 14px – 15px / Inter Regular o Medium (`leading-relaxed text-slate-600`).
  - `Metadatos y Badges`: 11px – 12px / Inter Medium (`font-medium text-xs`).
  - `Moneda (₡)`: Siempre con el símbolo de colón antepuesto sin espacio (`₡5.000`), separador de miles con punto y decimales con coma cuando aplique.

---

### 7. Espaciado

Sistema modular de 4px / 8px:
- `space-1`: 4px (microespaciado de iconos)
- `space-2`: 8px (separación entre etiquetas)
- `space-3`: 12px (padding interno compacto)
- `space-4`: 16px (padding estándar de inputs y tarjetas móviles)
- `space-6`: 24px (padding de tarjetas desktop y separación de bloques)
- `space-8`: 32px (márgenes de módulos)
- `space-12`: 48px (separación entre secciones intermedias)
- `space-20`: 80px (padding vertical de secciones en landing)

---

### 8. Grid y Breakpoints

- **Móvil (`< 640px`)**: Columna única, botones anchos de altura táctil mínima (48px), navegación fija o accesible por pulgar.
- **Tablet (`640px - 1024px`)**: Cuadrícula de 2 columnas para KPIs y productos, navegación colapsable.
- **Desktop (`1024px+`)**: Ancho máximo de contenido de 1280px (`max-w-7xl`), sidebar fijo lateral de 256px (`w-64`), layout de 3 a 4 columnas para analítica.

---

### 9. Bordes y Elevación

- **Radio de Esquinas:** 
  - Botones y inputs: `rounded-xl` (12px).
  - Tarjetas y módulos: `rounded-2xl` (16px).
  - Contenedores destacados: `rounded-3xl` (24px).
- **Sombras:**
  - `shadow-sm`: `0 1px 2px 0 rgb(0 0 0 / 0.05)` (Tarjetas estándar en fondo `#F8FAFC`).
  - `shadow-md`: `0 4px 6px -1px rgb(0 0 0 / 0.08)` (Tarjetas activas o hover).
  - `shadow-xl`: `0 20px 25px -5px rgb(15 42 92 / 0.12)` (Hero cards, modales).
  - `shadow-glow`: `0 0 20px -3px rgba(45, 212, 167, 0.35)` (Botones y destacados menta).

---

### 10. Botones

1. **Botón Primario Institucional:**
   - Clase: `bg-[#0F2A5C] hover:bg-[#163875] text-white font-bold rounded-xl px-5 py-3 shadow-sm active:scale-95 transition-all`
2. **Botón de Acento (Confirmación / CTA):**
   - Clase: `bg-[#2DD4A7] hover:bg-[#25be94] text-[#0F2A5C] font-bold rounded-xl px-6 py-3 shadow-md shadow-[#2DD4A7]/25 active:scale-95 transition-all`
3. **Botón Secundario / Outline:**
   - Clase: `bg-white hover:bg-slate-50 text-[#0F2A5C] border border-slate-200 font-semibold rounded-xl px-4 py-2.5 transition-all`
4. **Botón Fantasma:**
   - Clase: `text-slate-600 hover:text-[#0F2A5C] hover:bg-slate-100 rounded-xl px-3 py-2 transition-colors`

---

### 11. Inputs y Formularios

- Altura mínima táctil: 44px – 48px.
- Fondo: `bg-slate-50` o `bg-white` con borde `border-slate-300`.
- Foco: `focus:ring-2 focus:ring-[#2DD4A7] focus:border-transparent outline-none`.
- Etiquetas: Arriba del campo, en mayúsculas pequeñas con espaciado: `text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5`.
- Textos de ayuda / error: Tipografía de 11px con icono descriptivo.

---

### 12. Tarjetas

- **Tarjeta Estándar:** Fondo blanco, borde fino `border-slate-200`, padding `p-6`, esquinas `rounded-2xl`, sombra sutil.
- **Tarjeta Interactiva:** Incluye transición de elevación `hover:shadow-md hover:border-slate-300 transition-all`.
- **Tarjeta de Copiloto IA:** Contenedor en azul profundo `#0F2A5C` con borde sutil `#2DD4A7/40`, datos contrastados en blanco y verde menta.

---

### 13. Tablas

- Cabecera: `bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] py-3.5 px-6 border-b border-slate-200`.
- Filas: `hover:bg-slate-50/80 transition-colors py-4 px-6 border-b border-slate-100 text-xs`.
- Alineación: Textos a la izquierda, números y montos a la derecha (`text-right font-mono font-bold`), estados centrados (`text-center`).

---

### 14. Navegación

- **Navbar Comercial:** Altura fija de 80px (`h-20`), fondo translúcido `#0F2A5C/95 backdrop-blur-md`, enlace directo al portal y llamada a la acción.
- **Sidebar Empresarial:** Ancho 256px (`w-64`), fondo `#0F2A5C`, jerarquía de enlaces con estados activo (`bg-[#2DD4A7] text-[#0F2A5C] font-semibold`) e inactivo (`text-slate-300 hover:bg-white/10`).
- **Navegación Móvil de Turno:** Barra de pestañas segmentada en el encabezado (50/50) con indicador activo en verde menta.

---

### 15. Estados de Información (Badges)

Los badges usan contenedores suaves con bordes coordinados:
- **Pagada:** `bg-[#2DD4A7]/20 text-[#0c7056] border border-[#2DD4A7]/40`
- **Pago Parcial:** `bg-amber-100 text-amber-800 border border-amber-300`
- **Pendiente (Fiado):** `bg-red-100 text-red-800 border border-red-300`
- **Validado / Seguro:** `bg-blue-100 text-[#0F2A5C] border border-blue-200`

---

### 16. Estados de Carga y Error

- **Carga (Skeleton):** Bloques redondeados con animación de pulso suave (`bg-slate-200 animate-pulse rounded-xl`).
- **Estados Vacíos (Empty States):** Icono representativo de 48px en contenedor circular `bg-slate-100 text-slate-400`, título explícito (`No hay ventas registradas`), descripción clara y botón de acción.
- **Degradación Segura:** Si el asistente externo no responde o tarda más de 8 segundos, el sistema presenta un aviso neutral: *«El proveedor del asistente no está disponible. Podés seguir usando el dashboard y los registros manuales normalmente»*.

---

### 17. Interfaces Conversacionales

- **Burbuja de Usuario:** Alineada a la derecha, fondo `#0F2A5C`, texto blanco, bordes redondeados (`rounded-2xl`).
- **Burbuja de FER AI:** Alineada a la izquierda, avatar con monograma o icono de chispa (`Sparkles`), fondo blanco con borde `border-slate-200`, texto en slate profundo.
- **Borrador de Venta Integrado:** Se inserta directamente en la conversación como una tarjeta estructurada e interactiva, nunca como texto plano difícil de auditar.

---

### 18. Confirmaciones Financieras

**Regla de Oro:** Ningún registro económico se escribe de forma irreversible sin confirmación explícita.
- El borrador de venta destaca de manera obligatoria:
  1. Productos y cantidades exactas.
  2. Total calculado en colones (`₡`).
  3. Abono o pago recibido (desglosado por Efectivo o SINPE Móvil con número de referencia).
  4. Saldo resultante por cobrar (fiado).
  5. Leyenda visible: *«Nada se registra sin tu confirmación»*.
  6. Acciones duales: Botón secundario «Editar» y botón primario «Confirmar».

---

### 19. Dashboard Gerencial

- Secciones clave:
  - Header de empresa activa y control de jornada operativa.
  - 3 KPIs prioritarios en colones (Ventas Totales, Dinero Cobrado, Saldo por Cobrar).
  - Barra de progreso de recaudación.
  - Tabla de transacciones con buscador por cliente/comprobante y selector de estado.

---

### 20. Landing Comercial

- Estructura en 12 secciones estratégicas:
  1. Header y navegación con acceso a `/acceso`.
  2. Hero principal con propuesta de valor y CTA.
  3. Demostración interactiva del escenario verificado: Pan de masa madre por ₡5.000 con pago de ₡2.000 y saldo de ₡3.000.
  4. Problema del pequeño empresario en Costa Rica.
  5. Solución FER AI.
  6. Cómo funciona en 4 pasos (*Expresá → Interpreta → Valida → Confirma*).
  7. Funcionalidades reales verificadas.
  8. Sectores económicos del país (sodas, panaderías, ferreterías, talleres, salones).
  9. Seguridad y soberanía de datos.
  10. Preguntas frecuentes (FAQ).
  11. Registro a Lista de Espera temprana (sin promesas ficticias ni precios inventados).
  12. Footer institucional.

---

### 21. Diseño Móvil

- Destinado a turnos activos y mostrador de atención.
- Los botones táctiles de producto deben responder con feedback visual al toque (`active:scale-95`).
- Teclado numérico o selector de cantidad optimizado para pulsaciones con una sola mano.
- Total y botón de confirmación siempre anclados a la parte inferior de la pantalla para evitar scroll innecesario.

---

### 22. Accesibilidad

- Contraste WCAG AA verificado en todos los textos sobre fondos `#0F2A5C` y `#F8FAFC`.
- Enlace oculto de salto de navegación: `<a className="skip" href="#contenido">Saltar al contenido</a>`.
- Navegación por teclado completa con indicador visible de enfoque: `outline: 3px solid #2DD4A7; outline-offset: 3px`.
- Compatibilidad con lectores de pantalla mediante atributos `aria-label`, `aria-expanded` en acordeones y semántica HTML nativa (`header`, `main`, `aside`, `nav`, `section`, `table`).
- Respeto a preferencias de usuario: `prefers-reduced-motion`.

---

### 23. Microinteracciones

- Transiciones cortas y predecibles (150ms – 200ms) en botones y tarjetas.
- Animación sutil de pulso en el indicador de conexión activa del copiloto.
- Notificaciones de éxito temporizadas con desvanecimiento suave (`fade-in`).

---

### 24. Reglas de Implementación

1. **Nunca reinventar el Stack:** Se utiliza Next.js App Router, React 19, TypeScript estricto y Tailwind CSS v4.
2. **Sin dependencias pesadas innecesarias:** Solo se incorpora `lucide-react` para iconografía consistente.
3. **Manejo monetario exacto:** Toda cifra se almacena internamente en enteros menores (céntimos o unidades enteras de colón) y se formatea con `Intl.NumberFormat('es-CR')`.
4. **Respeto a rutas existentes:** La landing vive en `src/app/page.tsx` y enlaza de forma canónica a `/acceso`, `/empresas`, `/empresa` y `/colaborador`.

---

### 25. Ejemplos de Uso Correcto e Incorrecto

#### Correcto ✅
- Describir el producto como: *«Copiloto inteligente en desarrollo y validación para pymes de Costa Rica»*.
- Mostrar una simulación identificada con claridad: *«Borrador interactivo de demostración»*.
- Presentar el dinero con su símbolo y formato local: *`₡5.000`*.
- Enlazar al acceso real existente de Supabase Auth en `/acceso`.

#### Incorrecto ❌
- Afirmar que *"FER AI es el primer SaaS del mundo con 10.000 clientes activos"* (Falso).
- Colocar testimonios de personas o empresas ficticias con fotos de stock (Deshonesto).
- Permitir que un usuario anónimo escriba transacciones financieras directamente a la base de datos de producción (Inseguro).
- Crear un segundo sistema de login con credenciales paralelas o ignorar las políticas RLS de Supabase (Vulnerabilidad).

