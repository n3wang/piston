
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


## Upgrading Locally
```
# Docker Desktop must be running
cd /Users/nenewang/Documents/GIT/piston

# 1) Stop & remove the container (keeps installed packages on disk)
docker compose down

# 2) Optional — wipe installed runtimes so ensure reinstalls clean
rm -rf data/piston/packages/*

# 3) Optional — rebuild Godot local package (only if you wiped it / need it)
(cd packages/godot/4.3.0 && ./build.sh)

# 4) Pull latest API image + recreate
docker compose pull api
docker compose up -d api --force-recreate

# 5) Watch auto-install (python/java/gcc + pip libs + godot)
docker compose logs -f api
```