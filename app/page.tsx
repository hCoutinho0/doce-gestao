import { redirect } from 'next/navigation';

// The root used to BE Lavily's own link-in-bio page — but Lavily is a
// confeitaria inside the system, not the system itself. Its link now
// lives at /c/lavily (see app/c/[bakeryId]/page.tsx); the root is the
// platform's own front door.
export default function RootPage() {
  redirect('/login');
}
