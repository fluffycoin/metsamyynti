#!/usr/bin/env bash
# Ajaa käyttäjä-, omistajuus- ja kiinnostustestit tyhjään kantaan.
# Vaatii PostgreSQL 15+ ja PostGIS. Käyttö:
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/users/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
migrations="${MIGRATIONS_DIR:-$root/supabase/migrations}"
db="${TEST_DB:-mm_users_test}"

dropdb --if-exists "$db" >/dev/null
createdb "$db"
run() { psql -q -v ON_ERROR_STOP=1 -d "$db" "$@" >/dev/null; }

[ -f "$root/supabase/tests/auth_stub.sql" ] && run -f "$root/supabase/tests/auth_stub.sql"
run -f "$here/supabase_stub.sql"
for f in "$migrations"/*.sql; do run -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/test_users.sql"
echo "OK: kaikki käyttäjätestit menivät läpi"
