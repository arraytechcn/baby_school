# 局域网访问

这台 Mac 当前的局域网地址：**192.168.0.100**。手机 / 平板需要连同一个 Wi-Fi。

## 两种打开方式

### 1）普通浏览（不能语音）

```
http://192.168.0.100:8899/chat.html
```

页面、历史、换装、作业都能用，但**麦克风会被浏览器禁用**：浏览器只把 localhost 和 HTTPS 当作安全上下文，局域网 HTTP 不是。表现是点"打电话"提示"麦克风打不开"。

### 2）完整语音（推荐）

```
https://192.168.0.100:9443/chat.html
```

需要先在手机上安装一次本地 CA（见下）。装好后麦克风、千问、语音都正常。

## 安装本地 CA（每台设备一次）

1. 手机浏览器打开：`http://192.168.0.100:8899/ca.crt`，下载证书。
2. **iPhone / iPad**：
   - 设置 → 已下载描述文件 → 安装；
   - 设置 → 通用 → 关于本机 → 证书信任设置 → 打开 `Xiaoxing Local CA` 的完全信任。
3. **Android**：
   - 设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书 → 选择刚下载的文件。
4. 打开 `https://192.168.0.100:9443/chat.html`，地址栏应显示正常锁标。

## 第一次在新设备上使用

新设备打开页面后会**自动从数据库同步**：API Key、核心思想、禁止话题、年龄年级、音色、星星、已解锁装扮、当前搭配、作业进度都会跟电脑一致，不需要重新填 Key。

如果页面是在这次更新之前打开的，刷新一次。如果还没声音：

1. 确认手机没有开静音开关，媒体音量不是 0；
2. 首次进入后随便点一下页面（浏览器要求用户手势才能播放声音），再点「给姐姐打电话」；
3. 确认电脑上的配置已经保存过（电脑先打开一次页面，档案才会上传）。

## 数据说明

| 数据 | 位置 | 是否跨设备 |
|---|---|---|
| 聊天记录、孩子事实 | Mac 的 `data/memory.db` | 是，所有设备共享 |
| 配置（Key/价值观/禁话题/年龄年级/音色） | `data/memory.db` 的 `profiles` 表，按孩子名字 | 是，所有设备共享 |
| 星星、装扮、作业进度 | 同上 | 是，所有设备共享 |
| 当日使用时长、音量 | 各设备浏览器 | 否 |

档案按孩子名字（当前是"朱炘榆"）存；换名字会生成新档案。

## 安全提醒

- 服务对整个局域网开放，**没有登录**：同一 Wi-Fi 下的人都能打开页面、读取或修改聊天记录；`/api/profile` 还会返回 API Key。
- 只在家里可信的 Wi-Fi 使用，不要在公共 Wi-Fi、公司网络或访客网络开放。
- 手机信任本地 CA 后，会信任这台 Mac 签发的证书；不再使用时可在手机的证书信任设置里删除。
- 如果 Mac 的局域网 IP 变了，HTTPS 证书会失效，需要重新生成。

## 启动命令

```bash
cd ~/Projects/baby

# HTTP（页面 + CA 下载）
python3 tools/memory_server.py --host 0.0.0.0 --port 8899

# HTTPS（手机语音用）
python3 tools/memory_server.py --host 0.0.0.0 --port 9443 \
  --https-cert data/certs/server.pem \
  --https-key data/certs/server-key.pem
```

两个进程共用 `data/memory.db`。

## IP 变了怎么重新生成证书

```bash
cd ~/Projects/baby
IP=192.168.0.123   # 换成新的局域网 IP

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout data/certs/ca-key.pem -out data/certs/ca.pem \
  -subj "/CN=Xiaoxing Local CA"

openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout data/certs/server-key.pem -out data/certs/server.csr \
  -subj "/CN=$IP"

cat > data/certs/ext.cnf <<EOF
subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost
extendedKeyUsage=serverAuth
EOF

openssl x509 -req -in data/certs/server.csr \
  -CA data/certs/ca.pem -CAkey data/certs/ca-key.pem -CAcreateserial \
  -out data/certs/server.pem -days 825 -sha256 -extfile data/certs/ext.cnf
```

手机需要重新安装新的 `ca.crt`（旧 CA 不再匹配）。
