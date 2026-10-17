#!/usr/bin/env bash
# What the host runs on every deploy, before starting the server.
#
# Render: Build Command -> ./build.sh
#         Start Command -> cd backend && gunicorn config.wsgi:application
#
# set -o errexit stops the deploy at the first failure rather than starting a
# server against a half-migrated database.
set -o errexit

pip install -r backend/requirements.txt

cd backend

# Collects the CSS and JS into staticfiles/ for WhiteNoise to serve.
python manage.py collectstatic --no-input

# Brings the database up to date. Safe to run every time: a migration that has
# already been applied is skipped.
python manage.py migrate

# Puts the 28 medicines on the shelf. Uses get_or_create, so it adds what is
# missing and leaves the levels of anything already there alone.
python manage.py seed_stock