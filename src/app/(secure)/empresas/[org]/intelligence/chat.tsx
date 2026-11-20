"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Submit } from "@/components/form";
import type { Answer } from "@/modules/intelligence/answer";
import type { DraftKey, DraftView } from "@/modules/conversation/contract";
import { DraftPanel, type DraftControls } from "./draft-panel";
import type { RequestInput } from "@/modules/intelligence/plan";

type Turn = { id: string; question: string; message: string; answer?: Answer };

const suggestions = [
  "¿Cuánto vendimos y cuánto cobramos por SINPE?",
  "¿Qué tengo pendiente de revisar?",
  "¿Cómo fue el último cierre?",
  "¿Cuáles fueron los productos más vendidos?",
];

const states = {
  confirmed: "Confirmado",
  pending: "Pendiente",
  unavailable: "No disponible",
} as const;

function Response({ answer }: { answer: Answer }) {
  return (
    <article className="surface panel intelligence-answer">
      <header className="intelligence-answer-header">
        <h2>FER AI</h2>
        <p>{answer.organization}</p>
        {answer.periods.length > 0 && (
          <p>
            Período consultado:{" "}
            {answer.periods
              .map(({ from, to }) => (from === to ? from : `${from} al ${to}`))
              .join(" y ")}
          </p>
        )}
      </header>
      <p>{answer.message}</p>
      {answer.indicators.length > 0 && (
        <dl className="intelligence-indicators">
          {answer.indicators.map(({ label, value, state, href }) => (
            <div key={href ?? label} className="intelligence-indicator">
              <dt>
                {href ? (
                  <Link className="text-link" href={href}>
                    {label}
                  </Link>
                ) : (
                  label
                )}
              </dt>
              <dd>
                <strong>{value}</strong>{" "}
                <span
                  className={`status ${state === "confirmed" ? "success" : "warning"}`}
                >
                  {states[state]}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {answer.missing.length > 0 && (
        <div className="feedback">
          <h3>No disponible</h3>
          <ul>
            {answer.missing.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {answer.warnings.length > 0 && (
        <ul className="intelligence-notes">
          {answer.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
      {answer.recommendations.length > 0 && (
        <section className="intelligence-recommendations">
          <h3>Recomendaciones</h3>
          <ol>
            {answer.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      )}
      {answer.sources.length > 0 && (
        <nav
          className="intelligence-sources"
          aria-label="Fuentes de la respuesta"
        >
          {answer.sources.map(({ label, href }) => (
            <Link key={href} href={href} className="text-link">
              {label}
            </Link>
          ))}
        </nav>
      )}
    </article>
  );
}

export function Chat({
  organization,
  today,
  action,
  controls,
  managerial,
}: {
  organization: string;
  today: string;
  action: (
    request: RequestInput & { draft: DraftKey | null },
  ) => Promise<{ message: string; answer?: Answer; draft?: DraftView | null }>;
  controls: DraftControls;
  managerial: boolean;
}) {
  const [draft, setDraft] = useState(controls.initial);
  const [operationNotice, setOperationNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [turns, send, pending] = useActionState(
    async (previous: Turn[], form: FormData) => {
      const active =
        draft && (draft.status === "editing" || draft.status === "review");
      const input = {
        question: question.trim(),
        from: String(form.get("from") ?? today),
        to: String(form.get("to") ?? today),
        draft: active ? { id: draft.id, revision: draft.revision } : null,
      };
      if (input.question.length < 3) return previous;
      let result: Awaited<ReturnType<typeof action>>;
      try {
        result = await action(input);
        if (result.draft !== undefined) {
          setDraft(result.draft);
          setOperationNotice("");
        }
      } catch {
        result = {
          message:
            "Se interrumpió la conexión. Intentá de nuevo o usá el formulario manual.",
        };
      }
      setQuestion("");
      return [
        ...previous.slice(-5),
        {
          id: crypto.randomUUID(),
          question: input.question,
          message: result.message,
          answer: result.answer,
        },
      ];
    },
    [],
  );

  return (
    <div className="intelligence-layout">
      {turns.length > 0 && (
        <div
          className="intelligence-thread"
          role="log"
          aria-label="Conversación con FER"
        >
          {turns.map(({ id, question: asked, answer, message }) => (
            <div className="intelligence-turn" key={id}>
              <p className="intelligence-question">{asked}</p>
              {answer ? (
                <Response answer={answer} />
              ) : (
                <article className="surface panel">
                  <p>{message}</p>
                </article>
              )}
            </div>
          ))}
        </div>
      )}
      {operationNotice && (
        <p className="feedback intelligence-mode" role="status">
          {operationNotice}
        </p>
      )}
      {draft && (
        <DraftPanel
          key={`${draft.id}:${draft.revision}:${draft.status}`}
          draft={draft}
          controls={controls}
          onChange={(next, message) => {
            setDraft(next);
            setOperationNotice(message);
          }}
        />
      )}
      <section
        className="surface panel intelligence-composer"
        aria-label="Enviar a FER"
      >
        <div
          className="intelligence-suggestions"
          aria-label="Preguntas sugeridas"
        >
          {(managerial
            ? [...suggestions, "Vendí un producto y me pagaron por SINPE"]
            : [
                "Vendí un producto y me pagaron por SINPE",
                "Me equivoqué, eran dos unidades",
              ]
          ).map((suggestion) => (
            <button
              type="button"
              className="button secondary"
              key={suggestion}
              disabled={pending}
              onClick={() => {
                setQuestion(suggestion);
                composer.current?.focus();
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <form className="form-stack" action={send}>
          {managerial && (
            <fieldset className="intelligence-period">
              <legend>Período de referencia</legend>
              <p>Se usa cuando la pregunta no indica una fecha.</p>
              <div className="operations-filter">
                <label>
                  Desde
                  <input
                    name="from"
                    type="date"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    max={today}
                    required
                  />
                </label>
                <label>
                  Hasta
                  <input
                    name="to"
                    type="date"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    max={today}
                    required
                  />
                </label>
              </div>
            </fieldset>
          )}
          <label>
            Tu pregunta
            <textarea
              ref={composer}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              readOnly={pending}
              maxLength={500}
              minLength={3}
              rows={3}
              required
              className="operations-notes"
            />
          </label>
          <div>
            <Submit pending="Consultando…">Enviar consulta</Submit>
          </div>
          {pending && (
            <p role="status">Consultando información de {organization}.</p>
          )}
        </form>
      </section>
    </div>
  );
}
