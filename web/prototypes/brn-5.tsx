// BRN-5: sign-up, sign-in, the signed-in app shell with "Sign out", and the redirect a signed-out visitor gets.
// The panel at the top switches screens, states and data; it is not part of the design.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Avatar, Button, Field, Input, Menu, Radio, RadioGroup, Separator } from '@base-ui/react';

// ---------------------------------------------------------------------------------------------------------------
// Fake data that breaks layouts.

interface Person {
  name: string;
  email: string;
  password: string;
}

const people = {
  typical: { name: 'Anna Schmidt', email: 'anna@example.com', password: 'correct-horse-battery' },
  long: {
    name: 'Maximiliane Alexandra Josephine von Hohenzollern-Sigmaringen-Wittelsbach',
    email: 'maximiliane.alexandra.josephine.von.hohenzollern-sigmaringen@an-unusually-long-company-domain.example',
    password: 'a-very-long-passphrase-that-someone-actually-typed-into-the-field-1234567890',
  },
  cyrillic: {
    name: 'Александра Константиновна Преображенская',
    email: 'a.preobrazhenskaya@yandex.ru',
    password: 'пароль-надёжный',
  },
  noName: { name: '', email: 'li@x.io', password: '12345678' },
} satisfies Record<string, Person>;

type PersonKey = keyof typeof people;

const personLabels: Record<PersonKey, string> = {
  typical: 'Typical',
  long: 'Very long name and email',
  cyrillic: 'Cyrillic name',
  noName: 'Empty name, short email',
};

// Better Auth's default minimum password length.
const MIN_PASSWORD = 8;

// ---------------------------------------------------------------------------------------------------------------
// Screens and their states.

const screens = {
  'sign-up': {
    label: 'Sign-up',
    states: {
      empty: 'Empty: a new visitor opens /sign-up.',
      filled: 'Filled, before submit.',
      submitting: 'Submitting: fields and the button are disabled until Better Auth answers.',
      missing: 'Submitted with empty fields: each required field says what is missing.',
      'email-taken': 'Error: the email is already registered. Offers to sign in instead.',
      'password-short': `Error: password shorter than ${MIN_PASSWORD} characters.`,
      'email-invalid': 'Error: the email is not a valid address.',
      'server-error': 'Error: the server failed. The fields keep what was typed.',
    },
  },
  'sign-in': {
    label: 'Sign-in',
    states: {
      empty: 'Empty: a visitor opens /sign-in.',
      submitting: 'Submitting: fields and the button are disabled until Better Auth answers.',
      wrong: 'Error: wrong email or password. It does not say which; the password is cleared.',
    },
  },
  shell: {
    label: 'Signed in: app shell',
    states: {
      closed: 'After sign-up or sign-in the user lands in the app. Their name is in the header.',
      open: 'The account menu open: name, email and "Sign out". Sign out goes to /sign-in.',
    },
  },
  'signed-out': {
    label: 'Signed out: opening the app',
    states: {
      root: 'A signed-out visitor opens / and is sent to /sign-in.',
      'deep-link': 'A signed-out visitor opens a link inside the app; after sign-in they land on that page.',
    },
  },
} as const;

type ScreenKey = keyof typeof screens;

interface View {
  screen: ScreenKey;
  state: string;
  person: PersonKey;
}

const defaultView: View = { screen: 'sign-up', state: 'empty', person: 'long' };

// The view lives in the URL hash, so that one state can be linked: /brn-5#sign-in/wrong/cyrillic
function readHash(): View {
  const [screen, state, person] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (!(screen in screens)) return defaultView;
  const key = screen as ScreenKey;
  const states = Object.keys(screens[key].states);
  return {
    screen: key,
    state: states.includes(state) ? state : states[0],
    person: person in people ? (person as PersonKey) : defaultView.person,
  };
}

function useView(): [View, (next: Partial<View>) => void] {
  const [view, setView] = useState(readHash);
  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (next: Partial<View>) => {
    const merged = { ...view, ...next };
    if (next.screen && !next.state) merged.state = Object.keys(screens[next.screen].states)[0];
    location.hash = `${merged.screen}/${merged.state}/${merged.person}`;
  };
  return [view, go];
}

// ---------------------------------------------------------------------------------------------------------------
// Prototype controls (not part of the design).

function Choice<T extends string>(props: {
  legend: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
}) {
  const { legend, value, options, onChange } = props;
  return (
    <div>
      <div id={`legend-${legend}`}>
        <strong>{legend}</strong>
      </div>
      <RadioGroup
        aria-labelledby={`legend-${legend}`}
        value={value}
        onValueChange={(v) => onChange(v as T)}
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        {(Object.keys(options) as T[]).map((key) => (
          <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
            <Radio.Root value={key}>
              <span aria-hidden>{value === key ? '●' : '○'}</span>
            </Radio.Root>
            {options[key]}
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

function Controls({ view, go }: { view: View; go: (next: Partial<View>) => void }) {
  const screenOptions = Object.fromEntries(
    Object.entries(screens).map(([key, s]) => [key, s.label]),
  ) as Record<ScreenKey, string>;
  const stateOptions = screens[view.screen].states as Record<string, string>;
  return (
    <aside aria-label="Prototype controls" style={{ padding: 16, border: '1px dashed' }}>
      <p style={{ marginTop: 0 }}>
        <strong>Prototype controls</strong>, not part of the design. Links and buttons in the screen below work too.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <Choice legend="Screen" value={view.screen} options={screenOptions} onChange={(screen) => go({ screen })} />
        <Choice legend="State" value={view.state} options={stateOptions} onChange={(state) => go({ state })} />
        <Choice legend="Data" value={view.person} options={personLabels} onChange={(person) => go({ person })} />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The design.

// The address the browser shows, so that the routes are part of the review.
function AddressBar({ path }: { path: string }) {
  return (
    <p style={{ margin: 0 }}>
      Address: <code>https://brandy.app{path}</code>
    </p>
  );
}

function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
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

function TextField(props: {
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  disabled: boolean;
  description?: string;
  error?: ReactNode;
}) {
  const { name, label, type, autoComplete, value, disabled, description, error } = props;
  return (
    <Field.Root name={name} disabled={disabled} invalid={Boolean(error)} style={column}>
      <Field.Label>{label}</Field.Label>
      <Input
        type={type}
        autoComplete={autoComplete}
        defaultValue={value}
        style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }}
      />
      {description && <Field.Description>{description}</Field.Description>}
      {error && <Field.Error match>{error}</Field.Error>}
    </Field.Root>
  );
}

function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" style={{ margin: 0 }}>
      {children}
    </p>
  );
}

function SignUp({ state, person, go }: { state: string; person: Person; go: (next: Partial<View>) => void }) {
  const values: Person = (() => {
    switch (state) {
      case 'empty':
      case 'missing':
        return { name: '', email: '', password: '' };
      case 'password-short':
        return { ...person, password: '1234567' };
      case 'email-invalid':
        return { ...person, email: person.email.replace('@', ' at ') };
      default:
        return person;
    }
  })();
  const submitting = state === 'submitting';
  const errors: Partial<Record<keyof Person, ReactNode>> = {};
  if (state === 'missing') {
    errors.name = 'Enter your name.';
    errors.email = 'Enter your email.';
    errors.password = 'Enter a password.';
  }
  if (state === 'email-taken') {
    errors.email = (
      <>
        An account with this email already exists.{' '}
        <a href="#sign-in" onClick={(e) => (e.preventDefault(), go({ screen: 'sign-in' }))}>
          Sign in instead
        </a>
      </>
    );
  }
  if (state === 'password-short') errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  if (state === 'email-invalid') errors.email = 'Enter an email address like name@example.com.';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go({ state: 'submitting' });
  };

  return (
    <>
      <AddressBar path="/sign-up" />
      <AuthLayout title="Create your account">
        {/* key: a new state starts from its own values */}
        <form key={`${state}-${values.email}`} onSubmit={submit} noValidate style={column}>
          <TextField
            name="name"
            label="Name"
            type="text"
            autoComplete="name"
            value={values.name}
            disabled={submitting}
            error={errors.name}
          />
          <TextField
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={values.email}
            disabled={submitting}
            error={errors.email}
          />
          <TextField
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            disabled={submitting}
            description={`At least ${MIN_PASSWORD} characters.`}
            error={errors.password}
          />
          {state === 'server-error' && (
            <FormAlert>Something went wrong on our side and the account was not created. Please try again.</FormAlert>
          )}
          <Button type="submit" disabled={submitting} focusableWhenDisabled>
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p style={{ margin: 0 }}>
          Already have an account?{' '}
          <a href="#sign-in" onClick={(e) => (e.preventDefault(), go({ screen: 'sign-in' }))}>
            Sign in
          </a>
        </p>
      </AuthLayout>
    </>
  );
}

function SignIn(props: { state: string; person: Person; path: string; go: (next: Partial<View>) => void }) {
  const { state, person, path, go } = props;
  const submitting = state === 'submitting';
  const values =
    state === 'submitting'
      ? person
      : state === 'wrong'
        ? { ...person, password: '' }
        : { name: '', email: '', password: '' };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go({ screen: 'sign-in', state: 'submitting' });
  };

  return (
    <>
      <AddressBar path={path} />
      <AuthLayout title="Sign in to brandy">
        <form key={`${state}-${values.email}`} onSubmit={submit} noValidate style={column}>
          {state === 'wrong' && <FormAlert>Email or password is incorrect.</FormAlert>}
          <TextField
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={values.email}
            disabled={submitting}
          />
          <TextField
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={values.password}
            disabled={submitting}
          />
          <Button type="submit" disabled={submitting} focusableWhenDisabled>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p style={{ margin: 0 }}>
          New to brandy?{' '}
          <a href="#sign-up" onClick={(e) => (e.preventDefault(), go({ screen: 'sign-up' }))}>
            Create an account
          </a>
        </p>
      </AuthLayout>
    </>
  );
}

function initials(person: Person) {
  const source = person.name.trim() || person.email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function AppShell({ state, person, go }: { state: string; person: Person; go: (next: Partial<View>) => void }) {
  // Better Auth requires a name at sign-up, but it can be blank: then the email stands in for it.
  const displayName = person.name.trim() || person.email;
  return (
    <>
      <AddressBar path="/" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <strong>brandy</strong>
          <Menu.Root key={state} defaultOpen={state === 'open'}>
            <Menu.Trigger
              render={<Button />}
              style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '60%' }}
            >
              <Avatar.Root>
                <Avatar.Fallback>{initials(person)}</Avatar.Fallback>
              </Avatar.Root>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
              <span aria-hidden>▾</span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={4}>
                <Menu.Popup style={{ maxWidth: 320, padding: 12, background: 'Canvas', border: '1px solid' }}>
                  <div style={{ overflowWrap: 'anywhere' }}>
                    {person.name.trim() && <div>{person.name}</div>}
                    <div>{person.email}</div>
                  </div>
                  <Separator style={{ margin: '8px 0' }} />
                  <Menu.Item onClick={() => go({ screen: 'sign-in', state: 'empty' })}>Sign out</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </header>
        <Separator />
        <main>
          <h1>brandy</h1>
          <p>The app's screens go here. Only a signed-in user sees them.</p>
        </main>
      </div>
    </>
  );
}

export default function Brn5() {
  const [view, go] = useView();
  const person = people[view.person];
  const description = (screens[view.screen].states as Record<string, string>)[view.state];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Controls view={view} go={go} />
      <p style={{ margin: 0 }}>
        <em>{description}</em>
      </p>
      <Separator />
      {view.screen === 'sign-up' && <SignUp state={view.state} person={person} go={go} />}
      {view.screen === 'sign-in' && <SignIn state={view.state} person={person} path="/sign-in" go={go} />}
      {view.screen === 'shell' && <AppShell state={view.state} person={person} go={go} />}
      {view.screen === 'signed-out' && (
        <SignIn
          state="empty"
          person={person}
          path={view.state === 'deep-link' ? '/sign-in?redirect=%2Fprojects%2F42%2Fsettings' : '/sign-in'}
          go={go}
        />
      )}
    </div>
  );
}
