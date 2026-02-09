FROM docker.io/library/node:18-alpine

RUN mkdir -p /opt

WORKDIR /opt/

COPY package.json package-lock.json ./

RUN npm install --production

COPY . .

ENV NODE_ENV=production

EXPOSE 3001

CMD [ "node", "/opt/src/index.js" ]

