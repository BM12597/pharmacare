"""
Django settings for PharmaCare+.

Values that differ between machines (secrets, database credentials, debug flag)
are read from a .env file so nothing sensitive is committed. Copy .env.example
to .env and fill it in before running the server.

The same file runs locally and on a host like Render. Nothing is edited before
deploying: on your machine .env supplies the values, and on the host the
platform's own environment variables do. Where the host publishes its address,
that is picked up as well, so the allowed hosts, the CSRF origins and the link
in a patient's collection email are all correct without being typed in twice.
"""

from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env(name, default=None, required=False):
    value = os.getenv(name, default)
    if required and not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def env_bool(name, default=False):
    return str(os.getenv(name, str(default))).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


# --------------------------------------------------------------------------
# Core
# --------------------------------------------------------------------------

SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# Render publishes the address it gave the service. Reading it here means the
# first deploy works without anyone having to come back and add the hostname
# by hand once it is known.
RENDER_HOST = env("RENDER_EXTERNAL_HOSTNAME", "")
if RENDER_HOST and RENDER_HOST not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(RENDER_HOST)

# Belt and braces for a host that does not publish its name: with DEBUG off and
# no hosts configured at all, every request would be rejected with a 400 that
# looks like the application is broken rather than unconfigured.
if not DEBUG and not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # PharmaCare+
    "accounts",
]

# Staff sign in with an issued ID, not a username or email.
AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",

    # Serves the CSS and JS in production. Django itself refuses to with DEBUG
    # off, and a host like Render has no nginx in front to do it instead.
    "whitenoise.middleware.WhiteNoiseMiddleware",

    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# The frontend/ folder sits next to backend/, so Django can serve those pages
# directly once the role portals are wired up.
FRONTEND_DIR = BASE_DIR.parent / "frontend"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [FRONTEND_DIR],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --------------------------------------------------------------------------
# Database — PostgreSQL
# --------------------------------------------------------------------------

# Three ways in, checked in order:
#
#   DATABASE_URL   one connection string, which is what a hosted Postgres
#                  (Render, Supabase, Neon) hands you. Set this and nothing
#                  else is read.
#   POSTGRES_*     the separate values, for a Postgres running on your own
#                  machine. This is what the project has used so far.
#   neither        SQLite in backend/db.sqlite3, so a fresh clone runs with
#                  no database to install first.

def _database_from_url(url):
    """
    Turn postgres://user:pass@host:port/name into Django's settings dict.

    Hand-rolled rather than adding dj-database-url, since it is a dozen lines
    and the project already avoids a dependency for work this size.
    """
    parsed = urlparse(url)
    query = parsed.query or ""

    config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or ""),
        "CONN_MAX_AGE": 60,
        "OPTIONS": {},
    }

    # Hosted Postgres refuses a plain connection. Saying so here rather than
    # leaving the first deploy to fail on an SSL error nobody expected.
    if "sslmode=" not in query:
        config["OPTIONS"]["sslmode"] = "require"

    return config


DATABASE_URL = env("DATABASE_URL", "")

if DATABASE_URL:
    DATABASES = {"default": _database_from_url(DATABASE_URL)}
elif env("POSTGRES_PASSWORD", "") or env("POSTGRES_HOST", ""):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB", "pharmacare"),
            "USER": env("POSTGRES_USER", "postgres"),
            "PASSWORD": env("POSTGRES_PASSWORD", ""),
            "HOST": env("POSTGRES_HOST", "localhost"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": 60,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------
# Trained models
# --------------------------------------------------------------------------

# Where build_pipeline.py's .pkl artifacts live. Roughly 40 MB, so they are
# loaded once per worker rather than per request.
MODEL_DIR = Path(env("MODEL_DIR", str(BASE_DIR / "models")))

# On a host with no persistent disk this folder is wiped on every deploy. The
# shipped .pkl files come back with the code, but a model promoted in the
# research workspace does not, so point MODEL_DIR at a mounted disk if a
# promoted model has to survive a redeploy.

# --------------------------------------------------------------------------
# Cloudinary
# --------------------------------------------------------------------------

# Patient files and uploads are stored in Cloudinary rather than on the server,
# so the storage figures in the management portal come from the Cloudinary
# account rather than from disk. Without these the portal says so plainly
# instead of showing an invented number.
CLOUDINARY_CLOUD_NAME = env("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = env("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = env("CLOUDINARY_API_SECRET", "")

# --------------------------------------------------------------------------
# Email — collection codes
# --------------------------------------------------------------------------

# Brevo is used as a plain SMTP relay, so nothing here is Brevo-specific and
# any mail server works by changing these four values.
#
# In Brevo: SMTP & API -> SMTP. The login is the address shown there, and the
# password is the SMTP key, which is NOT the account password.
#
#   BREVO_SMTP_USER=8xxxxx@smtp-brevo.com
#   BREVO_SMTP_KEY=xsmtpsib-...
#   MAIL_FROM=PharmaCare+ <noreply@yourdomain.co.za>
#
# With nothing configured the system still works: the prescription is written,
# the code exists, and the pharmacy is told the patient did not get an email.

EMAIL_HOST_USER_SET = bool(env("BREVO_SMTP_USER", "") and env("BREVO_SMTP_KEY", ""))

# With no SMTP details the mail goes to the terminal instead of nowhere. The
# collection code is printed in full, so the whole flow can still be walked
# through on a machine that has never been given a mail server.
EMAIL_BACKEND = env(
    "DJANGO_EMAIL_BACKEND",
    "django.core.mail.backends.smtp.EmailBackend" if EMAIL_HOST_USER_SET
    else "django.core.mail.backends.console.EmailBackend",
)

EMAIL_HOST = env("BREVO_SMTP_HOST", "smtp-relay.brevo.com")
EMAIL_PORT = int(env("BREVO_SMTP_PORT", "587"))
EMAIL_HOST_USER = env("BREVO_SMTP_USER", "")
EMAIL_HOST_PASSWORD = env("BREVO_SMTP_KEY", "")
EMAIL_USE_TLS = env_bool("BREVO_SMTP_TLS", True)
EMAIL_TIMEOUT = 15

DEFAULT_FROM_EMAIL = env("MAIL_FROM", "PharmaCare+ <noreply@pharmacare.local>")

# What goes in the collection link. It has to be reachable from the patient's
# own phone, so 127.0.0.1 only works while testing on this machine. On a host
# that publishes its address this fills itself in, which also means the QR code
# points somewhere a phone camera can actually open.
SITE_URL = env(
    "SITE_URL",
    f"https://{RENDER_HOST}" if RENDER_HOST else "http://127.0.0.1:8000",
).rstrip("/")

# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --------------------------------------------------------------------------
# Internationalisation
# --------------------------------------------------------------------------

LANGUAGE_CODE = "en-za"
TIME_ZONE = "Africa/Johannesburg"
USE_I18N = True
USE_TZ = True

# --------------------------------------------------------------------------
# Static files
# --------------------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [FRONTEND_DIR] if FRONTEND_DIR.exists() else []

# Compressed but not hashed. The pages reference /static/research/research.css
# directly rather than through Django's {% static %} tag, and the hashing
# storage renames every file, which would turn all of those into 404s.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# --------------------------------------------------------------------------
# Sessions and security
# --------------------------------------------------------------------------

# Clinical workstations are shared, so sessions end when the browser closes
# and expire after a period of inactivity.
SESSION_COOKIE_AGE = 60 * 60 * 2
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False  # the frontend JS reads this token to send it back

LOGIN_URL = "/login/"

if not DEBUG:
    # Render terminates HTTPS at its own proxy and forwards plain HTTP, so
    # without this Django sees an insecure request, redirects to HTTPS, and
    # the browser loops between the two forever.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"

CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

if RENDER_HOST:
    origin = f"https://{RENDER_HOST}"
    if origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

# A custom domain pointed at the same service needs to be trusted too, and the
# site URL is where that name is already written down.
if SITE_URL.startswith("https://") and SITE_URL not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append(SITE_URL)