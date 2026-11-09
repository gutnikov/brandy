// /sign-in: email and password. A wrong pair says so without saying which one is wrong, and clears the password.
import { Button } from '@base-ui/react/button';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type SubmitEvent } from 'react';
import { authClient, safeRedirect, sessionQuery, type AuthSearch } from './client.ts';
import { AuthForm, AuthLayout, FormAlert, TextField } from './parts.tsx';

type Values = { email: string; password: string };
type Errors = Partial<Record<keyof Values, string>>;

export function SignIn({ search }: { search: AuthSearch }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>({ email: '', password: '' });
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
    const found: Errors = {};
    if (!values.email.trim()) found.email = 'Enter your email.';
    if (!values.password) found.password = 'Enter your password.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const { error } = await authClient.signIn.email({ email: values.email.trim(), password: values.password });
    if (!error) {
      queryClient.removeQueries({ queryKey: sessionQuery.queryKey });
      await navigate({ href: safeRedirect(search.redirect) });
      return;
    }
    setSubmitting(false);
    if (error.status === 401 || error.code === 'INVALID_EMAIL_OR_PASSWORD' || error.code === 'VALIDATION_ERROR') {
      setValues((v) => ({ ...v, password: '' }));
      setAlert('Email or password is incorrect.');
      return;
    }
    setAlert(
      error.status === 429
        ? 'Too many attempts. Wait a minute and try again.'
        : 'Something went wrong on our side and you were not signed in. Please try again.',
    );
  };

  return (
    <AuthLayout title="Sign in to brandy">
      <AuthForm onSubmit={(e) => void submit(e)} data-testid="sign-in-form">
        {alert && <FormAlert>{alert}</FormAlert>}
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
          autoComplete="current-password"
          value={values.password}
          onChange={change('password')}
          disabled={submitting}
          error={errors.password}
        />
        <Button type="submit" disabled={submitting} focusableWhenDisabled>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </AuthForm>
      <p style={{ margin: 0 }}>
        New to brandy?{' '}
        <Link to="/sign-up" search={search}>
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
