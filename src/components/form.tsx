"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/modules/shared/actions";

export function Submit({
  children,
  pending = "Guardando…",
  kind = "primary",
}: {
  children: ReactNode;
  pending?: string;
  kind?: "primary" | "secondary";
}) {
  const status = useFormStatus();
  return (
    <button className={`button ${kind}`} disabled={status.pending}>
      {status.pending ? pending : children}
    </button>
  );
}

export function FormFeedback({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p className="feedback error" role="alert">
        {state.error}
      </p>
    );
  if (state.success)
    return (
      <p className="feedback success" role="status">
        {state.success}
      </p>
    );
  return null;
}

export function MutationForm({
  action,
  children,
  submit,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: ReactNode;
  submit: string;
}) {
  const [state, run] = useActionState(action, {});
  return (
    <form className="form-stack" action={run}>
      {children}
      <FormFeedback state={state} />
      <div>
        <Submit>{submit}</Submit>
      </div>
    </form>
  );
}
