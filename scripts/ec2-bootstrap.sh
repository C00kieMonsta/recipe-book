#!/usr/bin/env bash
# EC2 User Data — runs once on first boot as root.
# Pulls secrets from SSM, installs deps, clones repo, starts the API.

set -euo pipefail

REGION="eu-north-1"
SSM_PREFIX="/la-table-amelie/production"
REPO_URL_BASE="github.com/C00kieMonsta/recipe-book.git"
APP_DIR="/home/ec2-user/la-table-amelie"
APP_USER="ec2-user"
API_NAME="la-table-amelie-api"

log() { echo "[bootstrap] $*"; }

ssm_get() {
  aws ssm get-parameter \
    --region "$REGION" \
    --name "${SSM_PREFIX}/$1" \
    --with-decryption \
    --query Parameter.Value \
    --output text
}

# ── System packages ───────────────────────────────────────────────────────
log "Installing system packages..."
dnf update -y
dnf install -y git nginx

# ── Node.js 20 via NodeSource ─────────────────────────────────────────────
log "Installing Node.js 20..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

# ── pnpm ─────────────────────────────────────────────────────────────────
log "Installing pnpm..."
npm install -g pnpm@latest

# ── PM2 ──────────────────────────────────────────────────────────────────
log "Installing PM2..."
npm install -g pm2

# ── Pull secrets from SSM ────────────────────────────────────────────────
log "Fetching secrets from SSM..."
INGREDIENTS_TABLE=$(ssm_get "INGREDIENTS_TABLE")
RECIPES_TABLE=$(ssm_get "RECIPES_TABLE")
SETTINGS_TABLE=$(ssm_get "SETTINGS_TABLE")
EVENTS_TABLE=$(ssm_get "EVENTS_TABLE")
S3_BUCKET=$(ssm_get "S3_BUCKET")
ADMIN_CREDENTIALS=$(ssm_get "ADMIN_CREDENTIALS")
JWT_SECRET=$(ssm_get "JWT_SECRET")

# ── Clone repo ────────────────────────────────────────────────────────────
log "Cloning repository..."
sudo -u "$APP_USER" git clone \
  "https://${REPO_URL_BASE}" \
  "$APP_DIR"

# ── Write .env ────────────────────────────────────────────────────────────
log "Writing .env..."
cat > "${APP_DIR}/apps/backend/.env" <<EOF
NODE_ENV=production
PORT=3001
AWS_REGION=${REGION}
INGREDIENTS_TABLE=${INGREDIENTS_TABLE}
RECIPES_TABLE=${RECIPES_TABLE}
SETTINGS_TABLE=${SETTINGS_TABLE}
EVENTS_TABLE=${EVENTS_TABLE}
S3_BUCKET=${S3_BUCKET}
ADMIN_CREDENTIALS=${ADMIN_CREDENTIALS}
JWT_SECRET=${JWT_SECRET}
EOF
chown "$APP_USER:$APP_USER" "${APP_DIR}/apps/backend/.env"
chmod 600 "${APP_DIR}/apps/backend/.env"

# ── Build ─────────────────────────────────────────────────────────────────
log "Installing dependencies and building..."
cd "$APP_DIR"
sudo -u "$APP_USER" pnpm install --frozen-lockfile
sudo -u "$APP_USER" pnpm build:packages
sudo -u "$APP_USER" pnpm build:backend

# ── PM2 start + save ─────────────────────────────────────────────────────
log "Starting API with PM2..."
sudo -u "$APP_USER" pm2 start "${APP_DIR}/apps/backend/dist/main.js" \
  --name "$API_NAME" \
  --cwd "${APP_DIR}/apps/backend" \
  --env production

sudo -u "$APP_USER" pm2 save
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd \
  -u "$APP_USER" --hp "/home/$APP_USER"

# ── Nginx config ──────────────────────────────────────────────────────────
log "Configuring Nginx..."
cat > /etc/nginx/conf.d/la-table-amelie.conf <<'NGINX_EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10m;
    }
}
NGINX_EOF

rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
systemctl enable nginx
systemctl start nginx

# ── CloudWatch agent ──────────────────────────────────────────────────────
log "Installing CloudWatch agent..."
dnf install -y amazon-cloudwatch-agent

cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<EOF
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/home/ec2-user/.pm2/logs/${API_NAME}-out.log",
            "log_group_name": "/la-table-amelie/api",
            "log_stream_name": "pm2-out",
            "timezone": "UTC"
          },
          {
            "file_path": "/home/ec2-user/.pm2/logs/${API_NAME}-error.log",
            "log_group_name": "/la-table-amelie/api",
            "log_stream_name": "pm2-error",
            "timezone": "UTC"
          },
          {
            "file_path": "/var/log/nginx/access.log",
            "log_group_name": "/la-table-amelie/nginx",
            "log_stream_name": "access",
            "timezone": "UTC"
          },
          {
            "file_path": "/var/log/nginx/error.log",
            "log_group_name": "/la-table-amelie/nginx",
            "log_stream_name": "error",
            "timezone": "UTC"
          },
          {
            "file_path": "/var/log/cloud-init-output.log",
            "log_group_name": "/la-table-amelie/bootstrap",
            "log_stream_name": "cloud-init",
            "timezone": "UTC"
          }
        ]
      }
    }
  }
}
EOF

systemctl enable amazon-cloudwatch-agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

log "✅ Bootstrap complete — API is live on port 80"
log "Logs available in CloudWatch under /la-table-amelie/"
