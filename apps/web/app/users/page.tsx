// apps/web/app/users/page.tsx
// Redirect /users → /search?tab=users so the "Find people to follow"
// link on the homepage feed empty state lands somewhere useful.

import { redirect } from "next/navigation";

export default function UsersPage() {
  redirect("/search?tab=users");
}
