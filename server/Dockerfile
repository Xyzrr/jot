# Use official Bun image as base
FROM oven/bun:1 AS base
WORKDIR /app

# Install Python and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment for Python
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies
FROM base AS install
WORKDIR /app

# Copy package files (server has its own package.json)
COPY package.json ./
RUN bun install

# Copy Python requirements and install
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Production stage
FROM base AS release
WORKDIR /app

# Copy virtual environment from install stage
COPY --from=install /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy node_modules from install stage
COPY --from=install /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the server
RUN bun build index.ts --outdir dist --target bun

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start the server
CMD ["bun", "run", "dist/index.js"]

