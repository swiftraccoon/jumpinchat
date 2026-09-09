FROM docker.io/library/node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf

RUN mkdir -p /opt

WORKDIR /opt/

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 3001

CMD [ "node", "/opt/src/index.js" ]

