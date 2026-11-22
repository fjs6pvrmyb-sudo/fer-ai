"use client";

import { useActionState } from "react";
import { signIn } from "@/modules/auth/actions";
import { FormFeedback, Submit } from "@/components/form";
import { Icon } from "@/components/icon";

export function LoginForm({
  configured,
  forSale,
}: {
  configured: boolean;
  forSale: boolean;
}) {
  const [message, run] = useActionState(signIn, "");
  return (
    <form className="form-stack login-form" action={run}>
      {forSale ? <input type="hidden" name="destino" value="venta" /> : null}
      <label>
        Correo electrónico
        <input
          name="email"
          type="email"
          autoComplete="username"
          placeholder="nombre@empresa.example"
          required
        />
      </label>
      <label>
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <FormFeedback
        state={{
          error:
            message ||
            (configured
              ? undefined
              : "El servicio de acceso todavía no está configurado."),
        }}
      />
      {configured ? (
        <Submit pending="Ingresando…">
          Iniciar sesión <Icon name="arrow" size={17} />
        </Submit>
      ) : (
        <button className="button primary" disabled>
          Iniciar sesión
        </button>
      )}
    </form>
  );
}
