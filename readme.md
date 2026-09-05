
## Setup Locally Mac Windows


```

docker compose down

# Docker Desktop must be running
cd /Users/nenewang/Documents/GIT/piston

# Optional: build local Godot package once (Linux binary; works on Mac host)
#   (cd packages/godot/4.3.0 && ./build.sh)

docker compose up -d api
# On startup the API auto-installs learn-programming runtimes:
#   python=3.12.0 (+ matplotlib, numpy, pandas, seaborn, …)
#   java=15.0.2
#   gcc=10.2.0  (c / c++)
#   godot=4.3.0 if packages/godot/4.3.0/godot exists
# Manifest: api/src/learn_runtimes.json
# Disable with PISTON_ENSURE_LEARN_RUNTIMES=false

# Docs site (PISTON_PORT=2000 in .env)
cd /Users/nenewang/Documents/GIT/learn-programming
npm start

docker compose logs -f api          # watch auto-install + API logs
node cli/index.js ppman list        # installed packages

docker compose down                 # stop
```
