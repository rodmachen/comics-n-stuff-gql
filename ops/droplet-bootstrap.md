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
