// A team page: members in tabs, an invite form in a dialog, and an empty state. Shows the common Base UI parts.
import { Avatar, Button, Checkbox, Dialog, Field, Input, Progress, Separator, Switch, Tabs } from '@base-ui/react';
import { members, type Member } from './_data.tsx';

const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' });

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function MemberRow({ member }: { member: Member }) {
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0' }}>
      <Avatar.Root>
        <Avatar.Fallback>{initials(member.name)}</Avatar.Fallback>
      </Avatar.Root>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>{member.name}</div>
        <div>{member.email}</div>
        <div>{member.role ?? 'No role'}</div>
      </div>
      <div>{money.format(member.spent)}</div>
      <Switch.Root defaultChecked={member.spent > 0} aria-label={`Active: ${member.name}`}>
        <Switch.Thumb />
      </Switch.Root>
    </li>
  );
}

function InviteDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button />}>Invite a member</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Invite a member</Dialog.Title>
          <Dialog.Description>They get an email with a link that works for 7 days.</Dialog.Description>
          <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field.Root>
              <Field.Label>Email</Field.Label>
              <Input type="email" required placeholder="name@company.com" />
              <Field.Error match="valueMissing">Enter an email address.</Field.Error>
            </Field.Root>
            <label style={{ display: 'flex', gap: 8 }}>
              <Checkbox.Root defaultChecked>
                <Checkbox.Indicator>✓</Checkbox.Indicator>
              </Checkbox.Root>
              Can invite others
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Dialog.Close render={<Button />}>Cancel</Dialog.Close>
              <Button type="submit">Send invite</Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function Example() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <h1>Team</h1>
        <InviteDialog />
      </header>
      <Progress.Root value={3} max={5}>
        <Progress.Label>Seats used: 3 of 5</Progress.Label>
        <Progress.Track>
          <Progress.Indicator />
        </Progress.Track>
      </Progress.Root>
      <Separator />
      <Tabs.Root defaultValue="members">
        <Tabs.List>
          <Tabs.Tab value="members">Members ({members.length})</Tabs.Tab>
          <Tabs.Tab value="invites">Pending invites (0)</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="members">
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {members.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </ul>
        </Tabs.Panel>
        <Tabs.Panel value="invites">
          <p>No pending invites. Invite someone and they show up here until they accept.</p>
        </Tabs.Panel>
      </Tabs.Root>
    </main>
  );
}
