# i02 — Deploy & Test: Piston Interactive Code Runner

> **Stack:** Node.js API (Express + WebSocket) · React + xterm.js (Vite → nginx) · Caddy reverse proxy · Docker Compose
> **Domain:** `https://piston.l.l0l.in`

---

## i02.1 — Prerequisites

Confirm these are in place before starting.

```bash
# Docker daemon is running
docker ps

# The shared `web` network exists (used by Caddy and all sites)
docker network ls | grep web

# Caddy is up
docker ps | grep caddy
```

If the `web` network is missing:

```bash
docker network create web
```

---

## i02.2 — Copy Files into Place

The site lives at `/root/docker/sites/piston/`. The source was staged in `/tmp/piston-site/`.

```bash
sudo cp -r /tmp/piston-site /root/docker/sites/piston
```

Expected layout after copy:

```
/root/docker/sites/piston/
├── docker-compose.yml
├── api/
│   ├── Dockerfile          # node:20-bookworm-slim + gcc + g++ + python3
│   ├── package.json
│   └── server.js           # Express REST + WebSocket /api/v2/connect
└── web/
    ├── Dockerfile          # multi-stage: vite build → nginx:alpine
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx         # editor + WebSocket orchestration
        ├── App.css
        └── components/
            └── Terminal.jsx  # xterm.js with local echo + input buffering
```

---

## i02.3 — Update Caddy Config

Add the `piston.l.l0l.in` vhost to the Caddyfile. The staged version is at `/tmp/Caddyfile.new`.

```bash
sudo cp /tmp/Caddyfile.new /root/docker/caddy/Caddyfile
```

The block added:

```caddy
piston.l.l0l.in {
    # REST + WebSocket — Caddy upgrades WS connections automatically
    handle /api/* {
        reverse_proxy piston-api:2000
    }
    # React SPA
    handle {
        reverse_proxy piston-web:80
    }
}
```

Verify the file looks correct:

```bash
cat /root/docker/caddy/Caddyfile
```

---

## i02.4 — Build and Start the Piston Services

```bash
cd /root/docker/sites/piston
docker compose up -d --build
```

The first build takes a few minutes — it installs `gcc`, `g++`, `python3` in the API image and runs `npm run build` (Vite) for the web image.

Watch build output:

```bash
docker compose logs -f
```

---

## i02.5 — Reload Caddy

```bash
cd /root/docker
docker compose restart caddy
```

Caddy will request a Let's Encrypt certificate for `piston.l.l0l.in` automatically on the first HTTPS request.

---

## i02.6 — Verify Containers Are Running

```bash
docker ps | grep piston
```

Expected:

```
piston-api   ...   Up   0.0.0.0:2000/tcp (internal)
piston-web   ...   Up   80/tcp (internal)
```

Check individual logs if something is wrong:

```bash
docker logs piston-api --tail 30
docker logs piston-web --tail 30
```

---

## i02.7 — Test the API Directly

```bash
# Health check
curl -s https://piston.l.l0l.in/api/v2/runtimes | python3 -m json.tool
```

Expected response:

```json
[
  {"language": "c",      "version": "12.x.x", "aliases": ["gcc"],              "runtime": "gcc"},
  {"language": "c++",    "version": "12.x.x", "aliases": ["cpp","g++","cxx"],  "runtime": "gcc"},
  {"language": "python", "version": "3.x.x",  "aliases": ["py","py3","python3"]}
]
```

---

## i02.8 — Test Code Execution (REST)

**Python:**

```bash
curl -s -X POST https://piston.l.l0l.in/api/v2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "files": [{"name": "main.py", "content": "print(\"hello from python\")"}]
  }' | python3 -m json.tool
```

**C:**

```bash
cat > /tmp/test_c.json << 'EOF'
{
  "language": "c",
  "files": [{"name": "main.c", "content": "#include <stdio.h>\nint main(){printf(\"hello from c\\n\");return 0;}"}]
}
EOF
curl -s -X POST https://piston.l.l0l.in/api/v2/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/test_c.json | python3 -m json.tool
```

**C++:**

```bash
cat > /tmp/test_cpp.json << 'EOF'
{
  "language": "c++",
  "files": [{"name": "main.cpp", "content": "#include <iostream>\nint main(){std::cout<<\"hello from c++\"<<std::endl;return 0;}"}]
}
EOF
curl -s -X POST https://piston.l.l0l.in/api/v2/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/test_cpp.json | python3 -m json.tool
```

All three should return `"code": 0` and the expected string in `run.stdout`.

---

## i02.9 — Test the WebSocket (Interactive)

Use `websocat` to simulate what the browser does:

```bash
# Install websocat if needed
# curl -Lo /usr/local/bin/websocat https://github.com/vi/websocat/releases/latest/download/websocat.x86_64-unknown-linux-musl
# chmod +x /usr/local/bin/websocat

websocat "wss://piston.l.l0l.in/api/v2/connect"
```

Then paste the init frame:

```json
{"type":"init","language":"python","version":"*","files":[{"name":"main.py","content":"name=input('Name: ')\nprint(f'Hello, {name}!')","encoding":"utf8"}],"args":[],"run_timeout":10000,"compile_timeout":10000}
```

You should receive:

```json
{"type":"runtime","language":"python","version":"3.x.x"}
{"type":"stage","stage":"run"}
{"type":"data","stream":"stdout","data":"Name: "}
```

Then send the stdin frame:

```json
{"type":"data","stream":"stdin","data":"Alice\n"}
```

You should receive:

```json
{"type":"data","stream":"stdout","data":"Hello, Alice!"}
{"type":"exit","stage":"run","code":0,"signal":null}
```

---

## i02.10 — Test the Browser UI

Open in any browser:

```
https://piston.l.l0l.in
```

Checklist:

- [ ] Page loads — editor on the left, terminal on the right
- [ ] Language dropdown shows Python / C / C++
- [ ] Click **▶ Run** with Python selected — status shows `Compiling…` then `Running…`
- [ ] Terminal prints `Enter your name:` — type something and press Enter
- [ ] Terminal prints the greeting and `✓ exited with code 0`
- [ ] Switch to C or C++, click Run — compiler stage appears in terminal, then runs interactively
- [ ] Click **■ Stop** mid-run — process is killed, status resets to Ready

---

## i02.11 — Restart and Maintenance

**Restart everything:**

```bash
cd /root/docker/sites/piston && docker compose restart
```

**Restart only the API:**

```bash
docker restart piston-api
```

**Rebuild after code changes:**

```bash
cd /root/docker/sites/piston && docker compose up -d --build
```

**Stop and remove:**

```bash
cd /root/docker/sites/piston && docker compose down
```

**Live logs:**

```bash
docker logs piston-api -f
docker logs piston-web -f
docker logs caddy -f
```

**Clean up orphaned temp files** (if API crashes mid-execution):

```bash
docker exec piston-api sh -c "ls /tmp/piston-* 2>/dev/null | wc -l"
docker exec piston-api sh -c "rm -rf /tmp/piston-*"
```

---

## i02.12 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `https://piston.l.l0l.in` — SSL error | Caddy hasn't got cert yet | Wait 30s and retry; check `docker logs caddy` |
| `502 Bad Gateway` | Container not running | `docker compose up -d` in sites/piston |
| API returns `Runtime not found` | Language name typo | Use `c`, `c++`, or `python` (see `/api/v2/runtimes`) |
| Terminal shows `Connection error` | WebSocket blocked or API down | Check `docker logs piston-api` |
| Program output not streaming | Missing `-u` flag (Python) or `setbuf` (C) | Already in default examples; add to custom code |
| Compile errors on valid code | Wrong language selected | Match language to file extension |
| `docker compose` not found | Old Docker install | Use `docker-compose` (with hyphen) instead |
