
## Setup Locally Mac Windows


```

docker compose down

# Docker Desktop must be running
cd /Users/nenewang/Documents/GIT/piston
docker compose up -d api

# Docs site (PISTON_PORT=2000 in .env)
cd /Users/nenewang/Documents/GIT/learn-programming
npm start



docker compose logs -f api          # piston logs
node cli/index.js ppman list        # available packages
node cli/index.js ppman install python=3.12.0
node cli/index.js ppman install java=15.0.2

# Extra Python libraries (after python is installed). Bind-mount on Mac:
docker exec piston_api /piston/packages/python/3.12.0/bin/pip3 install \
  matplotlib pillow seaborn requests beautifulsoup4 lxml pyyaml toml \
  python-dateutil pytz tqdm tabulate

docker compose down                 # stop
```