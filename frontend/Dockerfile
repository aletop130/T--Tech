FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
COPY scripts/ ./scripts/

RUN npm install --legacy-peer-deps --ignore-scripts
RUN npm run postinstall

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npm run build && npm start"]