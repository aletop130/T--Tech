FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY scripts/ ./scripts/

RUN npm install --legacy-peer-deps --ignore-scripts
RUN npm run postinstall

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start"]