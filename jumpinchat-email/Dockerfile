FROM docker.io/library/node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80

RUN npm install --global npm@12.2.0 --ignore-scripts

RUN mkdir -p /opt

WORKDIR /opt/

COPY package.json package-lock.json .npmrc ./

RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 3434

CMD [ "node", "/opt/src/index.js" ]
