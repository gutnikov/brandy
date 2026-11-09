// Fake data for the prototypes: long names, big numbers, missing fields.
export interface Member {
  id: string;
  name: string;
  email: string;
  role: string | null;
  spent: number;
}

export const members: Member[] = [
  {
    id: '1',
    name: 'Maximiliane Alexandra von Hohenzollern-Sigmaringen',
    email: 'maximiliane.alexandra.von.hohenzollern-sigmaringen@an-unusually-long-company-domain.example',
    role: 'Head of Strategic Partnerships, Europe, Middle East and Africa',
    spent: 1234567890.12,
  },
  { id: '2', name: 'Li Na', email: 'li@x.io', role: null, spent: 0 },
  { id: '3', name: 'José María Fernández-Ortiz', email: 'jm@example.com', role: 'Owner', spent: 98765.4 },
];
