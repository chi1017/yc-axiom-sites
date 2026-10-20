#!/bin/bash
cd /tmp/work/db
Q="psql -h /tmp -p 5544 -U postgres -q"
$Q -c "drop database if exists t2" -c "create database t2" 2>&1
P="$Q -d t2"
$P -f tests/00_stub.sql >/dev/null
$P -f tests/01_storage_stub.sql >/dev/null
for m in 001_schema 002_retention 003_keepalive 004_geo; do $P -v ON_ERROR_STOP=1 -f migrations/$m.sql >/dev/null && echo "[$m OK]"; done
$P -v ON_ERROR_STOP=1 -f migrations/005_rental.sql >/dev/null && echo "[005 OK #1]"
$P -v ON_ERROR_STOP=1 -f migrations/005_rental.sql >/dev/null && echo "[005 OK #2 (idempotent)]"
$P -v ON_ERROR_STOP=1 -f migrations/006_rental_admin.sql >/dev/null && echo "[006 OK #1]"
$P -v ON_ERROR_STOP=1 -f migrations/006_rental_admin.sql >/dev/null && echo "[006 OK #2 (idempotent)]"
$P -v ON_ERROR_STOP=1 -f migrations/007_rental_cron.sql >/dev/null && echo "[007 OK #1]"
$P -v ON_ERROR_STOP=1 -f migrations/007_rental_cron.sql >/dev/null && echo "[007 OK #2 (idempotent)]"
if [ "$1" = "30" ]; then $P -f tests/30_rental_tests.sql 2>&1; elif [ "$1" = "32" ]; then $P -f tests/32_cron_tests.sql 2>&1; else $P -f tests/31_admin_tests.sql 2>&1; fi
