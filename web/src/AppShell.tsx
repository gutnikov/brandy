// The signed-in app: a header with the account menu ("Sign out"), and the page below it. Only a signed-in user
// gets here: the route guard (router.tsx) sends anyone else to /sign-in.
import { Avatar } from '@base-ui/react/avatar';
import { Button } from '@base-ui/react/button';
import { Menu } from '@base-ui/react/menu';
import { Separator } from '@base-ui/react/separator';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { authClient, displayName, initials, sessionQuery } from './auth/client.ts';

export function AppShell() {
  const queryClient = useQueryClient();
  const session = useQuery(sessionQuery).data;
  const [signingOut, setSigningOut] = useState(false);

  // Signed out (here, or the session ran out): back to the sign-in screen.
  if (!session) return <Navigate to="/sign-in" search={{}} />;
  const { user } = session;

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    queryClient.setQueryData(sessionQuery.queryKey, null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <strong>brandy</strong>
        <Menu.Root>
          <Menu.Trigger
            render={<Button />}
            data-testid="account-menu"
            style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '60%' }}
          >
            <Avatar.Root>
              <Avatar.Fallback>{initials(user)}</Avatar.Fallback>
            </Avatar.Root>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName(user)}
            </span>
            <span aria-hidden>▾</span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end" sideOffset={4}>
              <Menu.Popup style={{ maxWidth: 320, padding: 12, background: 'Canvas', border: '1px solid' }}>
                <div style={{ overflowWrap: 'anywhere' }} data-testid="account-details">
                  {user.name.trim() && <div>{user.name}</div>}
                  <div>{user.email}</div>
                </div>
                <Separator style={{ margin: '8px 0' }} />
                <Menu.Item disabled={signingOut} onClick={() => void signOut()}>
                  Sign out
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </header>
      <Separator />
      <Outlet />
    </div>
  );
}
