FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

COPY package.json yarn.lock* ./
RUN yarn install --production

COPY . .

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node", "index.js"]
