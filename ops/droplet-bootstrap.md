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

Generate a dedicated passwordless keypair **on your laptop** (the workflow can't unlock
a passphrase-protected key):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/comics-deploy -N "" -C "comics-n-stuff-gql deploy"
```

Append the public key to the droplet's `~/.ssh/authorized_keys`:

```bash
cat ~/.ssh/comics-deploy.pub | ssh rod@<droplet-ip> "cat >> ~/.ssh/authorized_keys"
```

Clone the repo at `/home/rod/stack` (the path the deploy workflow pulls from) and
symlink the env file from `/home/rod/ops/compose/` so credentials live outside the
git tree:

```bash
ssh rod@<droplet-ip>
cd /home/rod
git clone https://github.com/<owner>/comics-n-stuff-gql.git stack
ln -s /home/rod/ops/compose/.env /home/rod/stack/ops/compose/.env
```

Set the three GitHub Actions secrets (`gh` CLI from your laptop):

```bash
gh secret set DEPLOY_SSH_KEY < ~/.ssh/comics-deploy
gh secret set DROPLET_HOST   --body "<droplet-ip>"
gh secret set DROPLET_USER   --body "rod"
```

The deploy workflow runs the build command directly via SSH — no `command=` forced
restriction in `authorized_keys` is needed. The key is unrestricted on the droplet,
so keep it passwordless **and** dedicated to this repo (rotate by regenerating).

---

## 9. Backup setup

`comics_gcd` is **static data** — no scheduled backup is needed. Its source of truth
is `2026-02-15.sql` + `scripts/migrate-to-postgres.py`.

For any future personal databases on this droplet, install the weekly backup timer:

```bash
# Copy units from repo
sudo cp /home/rod/stack/ops/backup/pg-dump.service /etc/systemd/system/
sudo cp /home/rod/stack/ops/backup/pg-dump.timer /etc/systemd/system/

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
bash /home/rod/stack/ops/backup/pg-dump.sh
ls -lh /var/backups/postgres/
```

---

## 10. Monitoring — disk check MOTD

Install the disk-check script so it runs at every SSH login:

```bash
sudo cp /home/rod/stack/ops/monitoring/disk-check.sh /etc/update-motd.d/99-disk-check
sudo chmod +x /etc/update-motd.d/99-disk-check
```

Test it (exits 0 when below threshold, exits 1 and prints warning when at or above):

```bash
bash /etc/update-motd.d/99-disk-check        # real threshold (80%)
bash /etc/update-motd.d/99-disk-check 1      # force warning for testing
```
