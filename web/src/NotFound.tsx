import { Link } from '@tanstack/react-router';

// Any other address inside the signed-in app.
export function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>
        There is nothing at this address. <Link to="/">Go to the start page</Link>
      </p>
    </main>
  );
}
