// The pure form→request mapping behind the client-onboarding console (#500) —
// the only bit worth a check; the React form around it is trivial. A Client is
// pre-provisioned by email with `external = true` and a `client_site`; on first
// login they are matched by email and land in their site's town (ADR-0020).

export type CreateForm = {
  email: string
  external: boolean
  clientSite: string
}

// Build the POST /admin/users body from the console form. Trims the email and
// folds a blank client_site to null (unassigned), mirroring the server's
// `presence` clearing so the two ends agree on what "blank" means.
export function createPayload(form: CreateForm): {
  email: string
  external: boolean
  client_site: string | null
} {
  return {
    email: form.email.trim(),
    external: form.external,
    client_site: form.clientSite.trim() || null,
  }
}
