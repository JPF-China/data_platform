# Frontend Dockerfile - React + Vite
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Run development server (hot reload enabled)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
