# 13 - Deployment & Operations Guide

## Production Architecture & Deployment Matrix

```
[ Internet Client ]
       │  (Port 3001 / Port 80)
[ NGINX Reverse Proxy Container ]
       ├── /api/*   -->  FastAPI Container (Uvicorn) [Port 8001]
       └── /*       -->  Built React 19 Frontend Assets
```

---

## 1. Single-Command Docker Deployment

### Launch Containers
```bash
docker compose up -d --build
# Or using convenience scripts:
# Windows: docker_run.bat
# Linux:   bash docker_run.sh
```

### Stop Containers
```bash
docker compose down
# Or using convenience scripts:
# Windows: docker_stop.bat
# Linux:   bash docker_stop.sh
```

---

## 2. Docker Services Topology (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6.0
    container_name: cmes_mp_mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: cmes_mp_backend
    restart: unless-stopped
    depends_on:
      mongodb:
        condition: service_healthy
    env_file:
      - ./backend/.env
    environment:
      - MONGO_URL=mongodb://mongodb:27017
      - DB_NAME=cmes_mp_db
    ports:
      - "8002:8001"
    volumes:
      - backend_uploads:/app/uploads

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: cmes_mp_frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "3001:80"

volumes:
  mongodb_data:
  backend_uploads:
```

---

## Production Security Checkpoints
- Change default Super Admin password in `backend/.env`.
- Generate a 256-bit secret key for `JWT_SECRET`.
- Enable HTTPS with SSL certificates on Nginx.
- Set up automated daily MongoDB backups using `mongodump`.
