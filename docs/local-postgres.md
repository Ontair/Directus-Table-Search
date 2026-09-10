# Local Directus with PostgreSQL

`docker-compose.dev.yml` runs Directus 11.12.0 and PostgreSQL 16 in the same
Compose project. It deliberately keeps the previous SQLite volume attached only
to the one-shot migration service, so the original database remains available
for rollback.

The default credentials are for local development only. Copy `.env.example` to
`.env` to override them. Never reuse production credentials in this stack.

## One-time migration from the previous SQLite volume

The migration preserves uploaded files by reusing the existing uploads volume.
It transfers Directus metadata, users, roles, policies, permissions, presets,
activity, and all custom collections. `directus_migrations` is intentionally
kept from the freshly bootstrapped PostgreSQL database so its engine-specific
schema history stays correct.

1. Create a schema snapshot and an offline backup of `database.sqlite`.
2. Start PostgreSQL and let Directus create its PostgreSQL system tables.
3. Apply the SQLite schema snapshot to the new Directus instance.
4. Stop Directus and run the guarded migration service:

   ```sh
   MIGRATION_CONFIRM=sqlite-to-postgres \
   docker compose -f docker-compose.dev.yml --profile migration run --rm migrate-sqlite
   ```

5. Start Directus and verify API counts, permissions, relations, sorting,
   pagination, and Data Studio behavior.

The migration is transactional. Any conversion or count mismatch rolls back the
PostgreSQL changes. It never writes to the SQLite source volume.

## Daily use

```sh
docker compose -f docker-compose.dev.yml up -d database directus
docker compose -f docker-compose.dev.yml logs -f directus
```

To confirm the active database from inside PostgreSQL:

```sh
docker compose -f docker-compose.dev.yml exec database \
  psql -U directus -d directus -c "select version(), lower('Демо');"
```
