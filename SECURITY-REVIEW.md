# Security review — 2026-10-14

Scope: local single-operator pilot, source/configuration and npm dependency review. This is not a penetration test or approval for public multi-tenant hosting.

Changes:
- Bound X OAuth state to an HttpOnly, SameSite=Lax browser cookie, preventing completion of an authorization flow from a different browser. PKCE and 10-minute expiry remain enabled.
- Excluded environment variants, private-key formats, data/backups/uploads/logs, build output, dependencies, and the owner's brand context from version control.
- Updated compatible dependencies to resolve npm advisory findings in shell-quote/concurrently and source-map-js; audit after update reported zero known vulnerabilities.

Verified controls: SQL parameter binding; encrypted stored credentials; HttpOnly administration sessions; manual publish approval; signed expiring media URLs; media-only tunnel proxy allowlist. No real social posts were sent during this review.

Remaining limitations:
- Single local workspace: no tenant isolation, production identity system, or per-user roles.
- Signed media links are bearer capabilities: anyone holding a valid URL can read the media until expiration. Tunnel forwards through Cloudflare.
- Secrets and database backups are local files; protect filesystem access and backups. Generated login passwords appear in local startup logs, which are excluded from Git.
- Agent context can contain untrusted content; agent has draft-editing tools but no publishing tool. Human review remains necessary.
- Facebook/Threads/Instagram token renewal is manual. Public deployment needs an additional deployment security review.
