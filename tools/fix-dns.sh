#!/usr/bin/env bash
# fix-dns.sh — 修复沙盒 DNS 解析不稳定（GitHub 推送/拉取前先跑这个）
#
# 症状：
#   socket.gaierror: [Errno -3] Temporary failure in name resolution
#   间歇性出现，重试又通 —— 很容易被误判成"网络偶尔不好"。
#
# 实测根因（2026-09-17）：
#   沙盒默认 nameserver 183.60.83.19 / 183.60.82.98 丢包约 80%
#   （手工 UDP 查询各 6 次，仅成功 1~2 次）。
#   resolv.conf 是"顺序查询 + 5s 超时 + 重试"，坏服务器排在前面，
#   一次失败要烧掉约 10~20 秒才轮到下一个，所以表现为偶发超时。
#
# 修复：把公共 DNS 前置（顺序查询，前者优先）。
#   实测修复后：解析 30/30 成功，中位 8ms（原最坏 20s）。
#
# 用法：bash tools/fix-dns.sh      （幂等，可重复跑；带自检）
#
# 注意：DNS 失败 = 请求根本没出沙盒，远端零写入。
#       不要当成"推送失败了一半"，跑完本脚本直接重试即可。

set -u
CONF=/etc/resolv.conf
BAK="${TMPDIR:-/tmp}/resolv.conf.bak"

[ -f "$BAK" ] || cp "$CONF" "$BAK" 2>/dev/null

if grep -q "^# patched: public DNS first" "$CONF" 2>/dev/null; then
  echo "[fix-dns] 已修复，跳过"
else
  {
    echo "# patched: public DNS first (sandbox default NS drops ~80%)"
    echo "nameserver 119.29.29.29"
    echo "nameserver 223.5.5.5"
    cat "$CONF"
  } > /tmp/resolv.new && cat /tmp/resolv.new > "$CONF"
  echo "[fix-dns] 已写入公共 DNS（原配置备份到 $BAK）"
fi

# 自检
python3 -c "
import socket, time
ok=0; ts=[]
for _ in range(10):
    t=time.time()
    try:
        socket.getaddrinfo('api.github.com',443); ok+=1
    except Exception: pass
    ts.append((time.time()-t)*1000)
ts.sort()
print('[fix-dns] 自检: ok=%d/10  median %.1fms  max %.1fms' % (ok, ts[5], ts[-1]))
if ok < 10:
    print('[fix-dns] 警告: 仍有失败，可能需要重试或更换 DNS')
"
