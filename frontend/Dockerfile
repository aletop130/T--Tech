FROM node:20-alpine

WORKDIR /app

# Install dependencies first (without running postinstall)
COPY package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

# Copy the scripts directory needed for postinstall
COPY scripts/ ./scripts/

# Now run the postinstall script
RUN npm run postinstall

# Copy the rest of the source (for production builds)
COPY . .

EXPOSE 3000

# Default command (overridden in docker-compose for dev)
CMD ["npm", "run", "start"]
