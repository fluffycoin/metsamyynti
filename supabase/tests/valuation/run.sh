#!/usr/bin/env bash
# Ajaa hinta-arviotestit tyhjään kantaan. Vaatii PostgreSQL 15+ ja PostGIS, sekä
# käyttäjämigraatiot (20261121200*) samassa hakemistossa. Käyttö:
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/valuation/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
migrations="${MIGRATIONS_DIR:-$root/supabase/migrations}"
db="${TEST_DB:-mm_valuation_test}"

dropdb --if-exists "$db" >/dev/null
createdb "$db"
run() { psql -q -v ON_ERROR_STOP=1 -d "$db" "$@" >/dev/null; }

run -f "$root/supabase/tests/auth_stub.sql"
[ -f "$root/supabase/tests/users/supabase_stub.sql" ] && run -f "$root/supabase/tests/users/supabase_stub.sql"
for f in "$migrations"/*.sql; do run -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/test_valuation.sql"
echo "OK: kaikki hinta-arviotestit menivät läpi"
