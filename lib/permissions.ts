export function requireAdmin(user: { isAdmin: boolean } | null | undefined) {
  return !!user?.isAdmin;
}

export function hasRole(
  user: { role: "ADMIN" | "PILOT" | "SUCHER"; isAdmin: boolean } | null | undefined,
  roles: Array<"ADMIN" | "PILOT" | "SUCHER">
) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return roles.includes(user.role);
}