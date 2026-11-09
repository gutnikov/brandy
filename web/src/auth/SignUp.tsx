// /sign-up: create an account with name, email and password. On success Better Auth signs the user in.
import { Button } from '@base-ui/react/button';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { authClient, looksLikeEmail, MIN_PASSWORD, safeRedirect, sessionQuery, type AuthSearch } from './client.ts';
import { AuthForm, AuthLayout, FormAlert, TextField } from './parts.tsx';

type Values = { name: string; email: string; password: string };
type Errors = Partial<Record<keyof Values, ReactNode>>;

function validate(v: Values): Errors {
  const errors: Errors = {};
  if (!v.name.trim()) errors.name = 'Enter your name.';
  if (!v.email.trim()) errors.email = 'Enter your email.';
  else if (!looksLikeEmail(v.email.trim())) errors.email = 'Enter an email address like name@example.com.';
  if (!v.password) errors.password = 'Enter a password.';
  else if (v.password.length < MIN_PASSWORD) errors.password = `Use at least ${String(MIN_PASSWORD)} characters.`;
  return errors;
}

export function SignUp({ search }: { search: AuthSearch }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const change = (field: keyof Values) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAlert(undefined);
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const { error } = await authClient.signUp.email({
      name: values.name.trim(),
      email: values.email.trim(),
      password: values.password,
    });
    if (!error) {
      queryClient.removeQueries({ queryKey: sessionQuery.queryKey });
      await navigate({ href: safeRedirect(search.redirect) });
      return;
    }
    setSubmitting(false);
    switch (error.code) {
      case 'USER_ALREADY_EXISTS':
      case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
        setErrors({
          email: (
            <>
              An account with this email already exists.{' '}
              <Link to="/sign-in" search={search}>
                Sign in instead
              </Link>
            </>
          ),
        });
        return;
      case 'PASSWORD_TOO_SHORT':
        setErrors({ password: `Use at least ${String(MIN_PASSWORD)} characters.` });
        return;
      case 'INVALID_EMAIL':
      case 'VALIDATION_ERROR':
        setErrors({ email: 'Enter an email address like name@example.com.' });
        return;
    }
    setAlert(
      error.status === 429
        ? 'Too many attempts. Wait a minute and try again.'
        : 'Something went wrong on our side and the account was not created. Please try again.',
    );
  };

  return (
    <AuthLayout title="Create your account">
      <AuthForm onSubmit={(e) => void submit(e)} data-testid="sign-up-form">
        <TextField
          name="name"
          label="Name"
          type="text"
          autoComplete="name"
          value={values.name}
          onChange={change('name')}
          disabled={submitting}
          error={errors.name}
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={change('email')}
          disabled={submitting}
          error={errors.email}
        />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={change('password')}
          disabled={submitting}
          description={`At least ${String(MIN_PASSWORD)} characters.`}
          error={errors.password}
        />
        {alert && <FormAlert>{alert}</FormAlert>}
        <Button type="submit" disabled={submitting} focusableWhenDisabled>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </AuthForm>
      <p style={{ margin: 0 }}>
        Already have an account?{' '}
        <Link to="/sign-in" search={search}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
