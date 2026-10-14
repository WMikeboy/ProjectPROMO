# ProjectPROMO

[日本語](readme.md) | [English](README.en.md) | [繁體中文](README.zh-TW.md)
**Create with AI. Organize once. Publish across platforms.**

ProjectPROMO is an AI-assisted workspace for social media promotion. Organize brand information, copy, images, and videos into Content Sheets, review them before scheduling, and manage post status and performance across platforms in one place.

It is currently a locally runnable **single-workspace pilot**, with SaaS as the long-term goal. Account isolation, access controls, and billing for a production multi-tenant service are not yet available.

## Workflow

```text
Brand context + AI conversation
           ↓
Content Sheet (autosaved draft)
           ↓
Human review → Publish now / Schedule
           ↓
Independent platform jobs → Status, post ID, and URL
           ↓
Metrics sync → Dashboard
```

One Sheet holds shared content for one or more selected platforms. Duplicate a Sheet to create a different version for another platform.

## Implemented features

- **AI creative chat**: Bring your own DeepSeek API key to create, read, edit, and duplicate drafts. The model ID is configurable.
- **Persistent brand context**: Save brand positioning, voice, and product information for future creation.
- **Content editor**: Title, body, tags, media, platforms, and publishing time, with autosave, version checks, undo, and illustrative previews.
- **Human review**: Batch approval creates immutable publishing snapshots. The AI has no tools to approve or publish directly.
- **Distribution management**: Each platform succeeds or fails independently. Uncertain outcomes require manual verification to avoid duplicate posts from blind retries.
- **Dashboard**: Stores metric snapshots returned by platforms. Unavailable metrics remain empty; performance data is not simulated.

## Platform support

| Platform | Connection | Implemented publishing interfaces |
| --- | --- | --- |
| X | OAuth 2.0 PKCE or User Access Token | Text, images, video |
| Facebook Page | Page Access Token | Text, images, video |
| Threads | Threads User Access Token | Text, JPG/PNG, multiple images, one MP4 |
| Instagram | Instagram Login Token; professional account | JPG, up to four images, one MP4 Reel |

Implemented interfaces do not guarantee access for every account. Availability depends on platform permissions, media specifications, quotas, and review. Available metrics differ by platform. Mock API tests cover parts of the Threads/Instagram workflows; end-to-end verification with real accounts is still pending.

## Quick start

Requires Node.js 20.19+ and npm.

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` and set `ADMIN_PASSWORD` to your own long password. After signing in, configure DeepSeek and social platform tokens under “品牌與連接” (Brand & Connections). Set the X OAuth Client ID, Secret, and Callback in `.env`.

```powershell
npm run build
npm start
```

Open the [local workspace](http://127.0.0.1:4100/). Do not run multiple backends against the same local database at the same time.

For development, use `npm run dev`; the frontend is available at `http://127.0.0.1:5173/`. Run checks with:

```powershell
npm run check
```

## Media publishing and public URLs

The X/Facebook interfaces upload media directly. For Threads/Instagram, Meta currently fetches local media from an HTTPS URL, so configure:

```dotenv
MEDIA_PUBLIC_BASE_URL=https://your-media-host.example
```

`server/media-gateway.mjs` provides a local proxy on port 4101 that only accepts media reads. Connect it to your own HTTPS reverse proxy or tunnel. Media URLs are signed and expire after 24 hours; anyone holding a valid link can still access the media. Do not expose the administration interface directly to the public internet.

`npm start` does not start the tunnel automatically. If a temporary tunnel URL changes, update the environment configuration and restart the service. Keep both the service and tunnel running while platforms fetch media.

## Technology stack

- React, TypeScript, Vite
- Node.js, Express, Zod
- PostgreSQL; local PGlite by default
- SQL job queue and platform API adapters
- DeepSeek tool calling, local media storage, AES-256-GCM credential encryption

## Current limitations

- Local, single-administrator version. Multi-tenancy, production security and deployment, and SaaS billing are not complete.
- Images and videos are added manually. Generation provider interfaces are reserved but not connected to live generation services.
- Brand context is implemented; a product RAG knowledge base is not.
- Facebook/Threads/Instagram tokens require manual maintenance. X OAuth supports refresh.
- Social platform APIs may charge fees and impose their own authorization and usage restrictions. This project does not provide free platform credits.
- A Computer Use publishing executor is not implemented.
- An API accepting a publication does not guarantee immediate public visibility. Verify the result on the platform.

## Documentation

The following supporting documents are currently in Chinese:

- [Running and configuration](RUNNING.md)
- [Full product plan, including unimplemented items](PRODUCT-PLAN.md)
- [Platform rules research](platform-rules.md)
- [Security review and known limitations](SECURITY-REVIEW.md)

`.env`, local databases, uploaded media, logs, and private key files are excluded from Git. Do not include tokens or secrets in issues, screenshots, or commits.

## License

This project uses the [MIT License](LICENSE). Social platforms and third-party services remain subject to their own terms.
