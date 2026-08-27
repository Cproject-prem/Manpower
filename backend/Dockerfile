# ── Backend Dockerfile ─────────────────────────────────────────────────────
# Python 3.11 slim — keeps the image small
FROM python:3.11-slim

# Prevents Python from writing .pyc files and buffers stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install OS-level deps needed by Python packages and backup tools (rar, unrar, mongotools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc curl ca-certificates tar \
    && curl -fsSL https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-100.10.0.deb -o /tmp/tools.deb \
    && dpkg -i /tmp/tools.deb \
    && rm -f /tmp/tools.deb \
    && curl -fsSL https://www.rarlab.com/rar/rarlinux-x64-701.tar.gz | tar -xz -C /tmp \
    && cp /tmp/rar/rar /tmp/rar/unrar /usr/local/bin/ \
    && rm -rf /tmp/rar \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer cache — only re-runs when requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Create uploads directory (persisted via Docker volume in production)
RUN mkdir -p uploads

EXPOSE 8001

# Run with 2 workers; remove --reload in production
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
