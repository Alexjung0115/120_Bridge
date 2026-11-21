type AccessUser = { email?: string; email_confirmed_at?: string; is_anonymous?: boolean; app_metadata: Record<string, unknown> } | null;

export function canAccess(user: AccessUser, role: "citizen" | "counselor") {
  return !!user && !!user.email && !!user.email_confirmed_at && !user.is_anonymous &&
    user.app_metadata.bridge_role === role;
}
