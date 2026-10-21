FROM node:24-alpine
WORKDIR /app
ENV TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
COPY login ./login
EXPOSE 3000
CMD ["node", "src/server.js"]
