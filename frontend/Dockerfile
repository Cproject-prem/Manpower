# ── Frontend Dockerfile ────────────────────────────────────────────────────
# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions and install
# (Using yarn as it's the preferred package manager for this repo)
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the application
# We set an empty REACT_APP_BACKEND_URL because Nginx will proxy /api to the backend
ENV REACT_APP_BACKEND_URL=""
RUN yarn build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/*

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built assets from the builder stage
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
