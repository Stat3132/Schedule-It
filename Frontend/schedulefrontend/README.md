This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Environment Variables

Create a `.env.local` file (Next.js automatically loads it) with the following keys:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side use only)
- `SUPABASE_STORAGE_SERVICE_ROLE_KEY` (optional; lightweight service role used by automated smoke tests)
- `RESEND_API_KEY` / `RESEND_FROM` (email delivery)
- `CRON_SECRET` – shared secret that authorizes the scheduled purge job to call `/api/employment/purge`.

Never commit production secrets; the example values in this repo are for local development only.

### Storage smoke test

CI can verify that the profile-photo bucket is writable by running:

```bash
npm run smoke:storage
```

The script uploads a short text blob to `${NEXT_PUBLIC_SUPABASE_PROFILE_BUCKET}/smoke-tests/`, confirms it appears in a listing response, and deletes it. Provide your Supabase URL plus one of:

- `SUPABASE_STORAGE_SERVICE_ROLE_KEY` – preferred, scoped to storage access only.
- `SUPABASE_SERVICE_ROLE_KEY` – fallback if you do not have a dedicated storage key.

Add either secret to `.env.local` (and CI) so the smoke test can run without prompting.

## Automated purge job

Terminated employees remain visible for seven days. After that window, `/api/employment/purge` deletes their employment rows so they stop appearing anywhere in the product. The endpoint now requires the `x-cron-key` header to match `CRON_SECRET`.

- When deploying on Vercel, the included `vercel.json` schedules a daily cron at 08:00 UTC that hits `/api/employment/purge`. Define an environment variable named `cronSecret` in your Vercel project that matches `CRON_SECRET` so the cron call is authorized.
	- Keep the two values identical. One easy pattern is:

		```bash
		# Pick a strong secret once
		export CRON_SHARED_SECRET="generate-a-random-string"

		# Store it for the cron job header
		vercel secrets add cronSecret "$CRON_SHARED_SECRET"

		# Reuse the same value for the app env across environments
		for env in production preview development; do
			printf "%s" "$CRON_SHARED_SECRET" | vercel env add CRON_SECRET "$env" --force
		done
		```

		The local `.env.local` file should use the same string so manual `curl` calls succeed.
- If you deploy elsewhere, configure your platform’s scheduler (GitHub Actions, Azure Functions timer, Supabase cron, etc.) to issue a `POST` request to `https://<your-domain>/api/employment/purge` with the same header.
- You can manually trigger a purge locally with:

```bash
curl -X POST \
	-H "x-cron-key: $CRON_SECRET" \
	http://localhost:3000/api/employment/purge
```

This ensures terminated employees lose access immediately (via `/api/employment/terminate`) and are automatically scrubbed a week later without manual cleanup.
