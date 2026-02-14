FROM node:16-bullseye-slim AS deps
WORKDIR /app

COPY package*.json ./

RUN npm i

COPY . .

RUN npx prisma generate
RUN npm run build

FROM node:16-bullseye-slim AS app
WORKDIR /app

COPY --from=deps /app/dist ./dist
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/package.json ./package.json

RUN npm ci --only=production
RUN npx prisma generate

EXPOSE 3001

CMD [ "npm", "start" ]