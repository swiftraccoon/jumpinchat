FROM docker.io/library/node:18-alpine

RUN mkdir -p /opt

WORKDIR /opt/

ADD . /opt/

ENV NODE_ENV=production

EXPOSE 3001

CMD [ "node", "/opt/src/index.js" ]

