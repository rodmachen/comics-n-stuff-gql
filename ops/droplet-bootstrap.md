# Droplet Bootstrap Runbook

DigitalOcean droplet: `142.93.202.59` (nyc1, 2GB / 1vCPU / 50GB, Ubuntu 24.04 LTS)

## 1. Initial access

At droplet creation, add your SSH public key. Connect as root for first-time setup:

```bash
ssh -i ~/.ssh/droplet root@<droplet-ip>
```

## 2. System updates

```bash
apt update && apt upgrade -y
reboot
```

After reboot, if dpkg was interrupted:

```bash
sudo dpkg --configure -a
```

When prompted about `sshd_config`, choose **keep the local version**.

## 3. Non-root sudo user

```bash
adduser rod
usermod -aG sudo rod
rsync --archive --chown=rod:rod ~/.ssh /home/rod
```

**Test login in a new terminal before continuing:**

```bash
ssh -i ~/.ssh/droplet rod@<droplet-ip>
```

## 4. Disable root SSH login

```bash
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh
```

Verify: `ssh root@<droplet-ip>` should return `Permission denied (publickey)`.

## 5. Firewall (UFW)

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 6432
sudo ufw --force enable
sudo ufw status
```

Ports: 22 (SSH), 80 (HTTP/Caddy redirect), 443 (HTTPS), 6432 (PgBouncer).

## 6. fail2ban + unattended-upgrades

```bash
sudo apt install -y fail2ban unattended-upgrades
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades   # select Yes
```

## 7. Docker

Install from Docker's official apt repo (not Ubuntu's older package):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker rod
```

Log out and back in for the group to take effect.

## Verification

```bash
ssh root@<droplet-ip>                  # should fail: Permission denied
sudo ufw status                        # shows 22/80/443/6432 allowed
docker run hello-world                 # Hello from Docker!
sudo systemctl status fail2ban         # active (running)
```

---

## 8. Deploy SSH key (for GitHub Actions auto-deploy)

Generate a dedicated keypair on the droplet (Ed25519, no passphrase):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""
```

Add the public key to `~/.ssh/authorized_keys` with a **restricted command** so it
can only run the deploy script and nothing else:

```bash
echo "command=\"cd /opt/stack && git pull && docker compose -f ops/compose/docker-compose.yml up -d --build api\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding $(cat ~/.ssh/deploy_key.pub)" >> ~/.ssh/authorized_keys
```

Print the private key to copy into the GitHub Actions secret (`DEPLOY_SSH_KEY`):

```bash
cat ~/.ssh/deploy_key
```

Add these three secrets to the GitHub repo
(`Settings → Secrets and variables → Actions → New repository secret`):

| Secret name      | Value                            |
|------------------|----------------------------------|
| `DEPLOY_SSH_KEY` | contents of `~/.ssh/deploy_key`  |
| `DROPLET_HOST`   | droplet IP or hostname           |
| `DROPLET_USER`   | `rod`                            |

**Test the restriction** — this must fail with "Permission denied" or "forced command":

```bash
ssh -i ~/.ssh/deploy_key rod@<droplet-ip> ls
```

And this must succeed (runs the deploy command):

```bash
ssh -i ~/.ssh/deploy_key rod@<droplet-ip>
```

> **Note**: The repo at `/opt/stack` must be cloned before the deploy key works.
> Clone it once manually: `git clone https://github.com/<owner>/comics-n-stuff-gql.git /opt/stack`
> For a private repo, use a GitHub deploy key or HTTPS token in the remote URL.

---

## 9. Backup setup

`comics_gcd` is **static data** — no scheduled backup is needed. Its source of truth
is `2026-02-15.sql` + `scripts/migrate-to-postgres.py`.

For any future personal databases on this droplet, install the weekly backup timer:

```bash
# Copy units from repo
sudo cp /opt/stack/ops/backup/pg-dump.service /etc/systemd/system/
sudo cp /opt/stack/ops/backup/pg-dump.timer /etc/systemd/system/

# Create backup directory
sudo mkdir -p /var/backups/postgres
sudo chown rod:rod /var/backups/postgres

# Enable and start the timer
sudo systemctl daemon-reload
sudo systemctl enable --now pg-dump.timer
sudo systemctl list-timers pg-dump.timer
```

Manual test run:

```bash
bash /opt/stack/ops/backup/pg-dump.sh
ls -lh /var/backups/postgres/
```

---

## 10. Monitoring — disk check MOTD

Install the disk-check script so it runs at every SSH login:

```bash
sudo cp /opt/stack/ops/monitoring/disk-check.sh /etc/update-motd.d/99-disk-check
sudo chmod +x /etc/update-motd.d/99-disk-check
```

Test it (exits 0 when below threshold, exits 1 and prints warning when at or above):

```bash
bash /etc/update-motd.d/99-disk-check        # real threshold (80%)
bash /etc/update-motd.d/99-disk-check 1      # force warning for testing
```
