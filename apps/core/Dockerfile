FROM node:24

WORKDIR /app

COPY package*.json ./
COPY packages/ ./packages/
COPY apps/core/ ./apps/core/

RUN npm install --ignore-scripts
RUN npm rebuild better-sqlite3
RUN npm install --ignore-scripts --os=linux sharp
RUN npm -w packages/types run build
RUN npm -w packages/utils run build
RUN npm -w packages/schemas run build
RUN npm -w apps/core run build

ENV TIPELINE_IPC_SOCKET_ROOT=/tmp/tipeline/

RUN mkdir -p /tmp/tipeline

CMD ["node", "apps/core/dist/engine/Server.js"]
