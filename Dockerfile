FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# banco SQLite fica em /app/data (monte um volume aqui para persistir)
ENV DATA_DIR=/app/data
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
