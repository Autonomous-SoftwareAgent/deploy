#!/usr/bin/env bash
# Lấy bản mới của repo các dịch vụ đã khai về máy chủ, để bsn.js trích được commit đang được ghim.
# Không đụng repo deploy (bên gọi tự cập nhật nó trước) và không đụng thứ đang chạy.
#   bash infra/server/sync.sh        (BSN_ROOT mặc định /opt/bsn)
set -euo pipefail

BSN_ROOT="${BSN_ROOT:-/opt/bsn}"

fetch_repo() { # <url> <thư mục>
  if [ -d "$2/.git" ]; then
    git -C "$2" fetch --quiet origin main
    git -C "$2" checkout --quiet main
    git -C "$2" merge --quiet --ff-only origin/main
  else
    mkdir -p "$(dirname "$2")"
    git clone --quiet --branch main "$1" "$2"
  fi
}

# In ra từng dòng "<url> <đường dẫn>" từ platform.json và services/*.json; không tên dịch vụ nào nằm trong tệp này.
node -e '
  const fs = require("fs"), path = require("path");
  const dir = process.argv[1];
  const p = JSON.parse(fs.readFileSync(path.join(dir, "platform.json"), "utf8"));
  for (const f of fs.readdirSync(path.join(dir, "services")).filter((x) => x.endsWith(".json")).sort()) {
    const name = f.slice(0, -5);
    const svc = JSON.parse(fs.readFileSync(path.join(dir, "services", f), "utf8"));
    console.log(`https://github.com/${p.github.org}/${p.github.serviceRepoPrefix}${name}.git ${svc.repo}`);
  }
' "$BSN_ROOT/infra" | while read -r url rel; do
  echo "  $url -> $rel"
  fetch_repo "$url" "$BSN_ROOT/$rel"
done
