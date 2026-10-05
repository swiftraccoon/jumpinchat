FROM docker.io/library/node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

RUN npm install --global npm@12.2.0 --ignore-scripts

RUN mkdir -p /opt

WORKDIR /opt/

COPY package.json package-lock.json .npmrc ./

RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 3434

CMD [ "node", "/opt/src/index.js" ]
