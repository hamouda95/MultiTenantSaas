# Live deployment — 18 October 2026

Public app: https://multitenantsaas-live.onrender.com/login

## Release and resources

- Deployed application commit: `473651e59fe9e1f36d613d9b8856ec0e0dac47a0` from `feat/admin-pos-render-review` (PR #4).
- Render workspace: `multitenantsaas-api-test` (`tea-dba40u0m7kps73fcuidg`).
- New service: `multitenantsaas-live` (`srv-dbaase8m7kps7385179g`), Docker, Frankfurt, free compute plan.
- Deploy: `dep-dbaaseom7kps738518p0`, reported live at 2026-10-18 11:34 UTC.
- Neon project: `summer-bird-19294164`; new branch `saas-live-20261018` (`br-noisy-fog-ba1c0m4q`), copied from `saas-integration-test`.
- The original Render API service, Neon integration branch and default production branch were left intact. The new live branch is independent; future changes do not synchronize between them.

The source contained zero users and zero holdings when copied. Create an account on the live app, then create a holding and configure companies. Mac-local accounts/data were not imported. Registration grants ordinary account access; it does not grant platform administrator privileges. Holding owners can manage their own holding through Administration.

## Configuration

The service uses the final `render` Docker stage: public Next.js and NestJS on loopback only. `RENDER_EXTERNAL_URL` supplies the exact public HTTPS origin. Independent generated credentials for `saas_runtime` and `saas_control`, and a JWT secret, were passed directly to Render environment variables. No secrets are included here or in Git. Both SQL roles use verified TLS connections.

Neon migrations 06 (restricted control role and explicit policies) and 07 (holding lifecycle) were applied transactionally to the new branch. Restricted runtime queries returned zero unscoped ledgers/settings and no audit UPDATE permission. Control access to sessions and the lifecycle columns was verified; audit DELETE remained denied.

Auto-deploy is **off**. Later branch pushes do not change this live release. Deploy future tested releases deliberately through Render. Do not delete the source branch until you retarget the service to a maintained release/main branch. Do not merge solely to update this service: the old API service still auto-deploys main and uses its older database configuration.

This service was created through the Render connector, not a Blueprint sync. The connector creation surface does not expose the HTTP health-check path; Render currently uses its default TCP checks. Set `/health/ready` in the service Dashboard before relying on automatic HTTP readiness supervision. The committed Blueprint is a reference and was not applied to existing services.

## Verified from the public HTTPS origin

- `/login`: HTTP 200; full email/password form and create-account button visibly loaded in the browser.
- `/health/ready`: HTTP 200, `{"status":"ready"}`.
- `/api/v1/auth/me`: HTTP 401 with authentication-required response.
- `node scripts/check-deployment.cjs https://multitenantsaas-live.onrender.com`: passed.
- Render runtime logs confirmed successful PostgreSQL/RLS connection and API startup.

Authenticated workflows passed the existing disposable CI suite for this commit. No real user password was supplied, no live user/business records were created for testing, and live authenticated checkout/export were not exercised. Provider deployment status alone was not used as proof of public readiness.

## Operational limits

The free service is suitable for trying the app; capacity, uptime, monitoring, backup scheduling/restoration and recovery procedures still require production work. No paid compute upgrade was requested. No custom domain was configured. No first platform administrator was assigned; follow the operator bootstrap procedure in the French admin guide after registering the intended account. The functionality limits listed in the deployment review and French guide still apply.
