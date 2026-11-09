// The parts the sign-up and sign-in screens share, as in the approved prototype (web/prototypes/brn-5.tsx).
import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import type { ComponentProps, ReactNode } from 'react';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0 }}>
        <strong>brandy</strong>
      </p>
      <h1 style={{ margin: 0 }}>{title}</h1>
      {children}
    </main>
  );
}

const column = { display: 'flex', flexDirection: 'column', gap: 12 } as const;

/** The form of an auth screen: its fields in a column; the browser's own validation is off (the screen says why). */
export function AuthForm(props: ComponentProps<'form'>) {
  return <form noValidate style={column} {...props} />;
}

export function TextField(props: {
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  description?: string;
  error?: ReactNode;
}) {
  const { name, label, type, autoComplete, value, onChange, disabled, description, error } = props;
  return (
    <Field.Root name={name} disabled={disabled} invalid={Boolean(error)} style={column}>
      <Field.Label>{label}</Field.Label>
      <Input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onValueChange={(v) => {
          onChange(v);
        }}
        style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }}
      />
      {description && <Field.Description>{description}</Field.Description>}
      {error && <Field.Error match>{error}</Field.Error>}
    </Field.Root>
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" style={{ margin: 0 }}>
      {children}
    </p>
  );
}
