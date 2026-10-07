#!/usr/bin/env bash
# Chuẩn bị một máy Ubuntu để chạy hệ bằng lệnh bsn.js ngay trên máy đó.
# Chạy bằng một người dùng có sudo:  bash setup.sh
# Chạy lại được nhiều lần: thứ đã có thì bỏ qua, repo đã có thì chỉ lấy bản mới.
#
# Bố cục tạo ra (giống máy làm việc, để bsn.js không phải biết mình đang ở đâu):
#   $BSN_ROOT/infra/                     repo deploy
#   $BSN_ROOT/<đường dẫn repo khai trong tờ khai báo>   repo của từng dịch vụ
#
# CHƯA PHẢI cách của máy chạy thật: máy này lấy repo của dịch vụ về để trích tệp cấu hình
# và build tiến trình chạy kèm. Xem ROADMAP.md, chặng 6.
set -euo pipefail

BSN_ROOT="${BSN_ROOT:-/opt/bsn}"
DEPLOY_REPO="${DEPLOY_REPO:-https://github.com/Autonomous-SoftwareAgent/deploy.git}"
NODE_MAJOR="${NODE_MAJOR:-24}"

say() { printf '\n== %s\n' "$*"; }

say "Gói hệ thống"
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl git >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  say "Cài Docker (kho chính thức của Docker)"
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
sudo usermod -aG docker "$USER"

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAJOR" ]; then
  say "Cài Node $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi

say "Thư mục $BSN_ROOT"
sudo mkdir -p "$BSN_ROOT"
sudo chown "$USER":"$USER" "$BSN_ROOT"

say "Repo deploy"
if [ -d "$BSN_ROOT/infra/.git" ]; then
  git -C "$BSN_ROOT/infra" fetch --quiet origin main
  git -C "$BSN_ROOT/infra" merge --quiet --ff-only origin/main
else
  git clone --quiet --branch main "$DEPLOY_REPO" "$BSN_ROOT/infra"
fi

say "Repo của các dịch vụ đã khai"
BSN_ROOT="$BSN_ROOT" bash "$BSN_ROOT/infra/server/sync.sh"

say "Phiên bản"
docker --version
sudo docker compose version
node --version
git --version

say "Xong. Đăng xuất rồi đăng nhập lại để dùng docker không cần sudo, rồi:"
echo "  cd $BSN_ROOT && node infra/bsn.js check"
