FROM node:24

WORKDIR /app

COPY package*.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

RUN npm install --ignore-scripts
RUN npm rebuild better-sqlite3
# The Server runs the assistant itself (@tipeline/agent).
RUN npm -w packages/agent run build
RUN npm -w apps/server run build

ENV TIPELINE_IPC_SOCKET_ROOT=/tmp/tipeline/
ENV TIPELINE_SERVER_PORT=4001
ENV TIPELINE_SERVER_DB_PATH=/data/server.db

RUN mkdir -p /tmp/tipeline /data

CMD ["node", "apps/server/dist/index.js"]
