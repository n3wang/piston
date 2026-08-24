
## Setup Locally Mac


```
# Docker Desktop must be running
cd /Users/nenewang/Documents/GIT/piston
docker compose up -d api

# Docs site (PISTON_PORT=2000 in .env)
cd /Users/nenewang/Documents/GIT/learn-programming
npm start



docker compose logs -f api          # piston logs
node cli/index.js ppman list        # available packages
node cli/index.js ppman install python   # add more languages
docker compose down                 # stop
```